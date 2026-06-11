import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// AI-50: every real session was stored with accountId "" because /me requires
// the read:me scope we never request. These tests cover the fallback identity
// lookup (/rest/api/3/myself works with read:jira-user, which we DO have) and
// the getValidSession backfill that heals already-stored empty accountIds.

vi.mock("@/lib/jira/cookies", () => ({
  readSessionCookie: vi.fn(),
  writeSessionCookie: vi.fn(),
}));

import { readSessionCookie, writeSessionCookie } from "@/lib/jira/cookies";
import {
  fetchMyself,
  resolveAccountIdentity,
  getValidSession,
} from "@/lib/jira/oauth";

const fetchMock = vi.fn();
const readMock = readSessionCookie as ReturnType<typeof vi.fn>;
const writeMock = writeSessionCookie as ReturnType<typeof vi.fn>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("fetchMyself", () => {
  it("returns accountId + email from the cloud-scoped /myself endpoint", async () => {
    fetchMock.mockResolvedValue(json({ accountId: "acct-7", emailAddress: "e@x.co" }));
    const me = await fetchMyself("tok", "cloud-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.atlassian.com/ex/jira/cloud-1/rest/api/3/myself",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer tok" }),
      }),
    );
    expect(me).toEqual({ accountId: "acct-7", email: "e@x.co" });
  });

  it("returns null on a non-OK response", async () => {
    fetchMock.mockResolvedValue(new Response("forbidden", { status: 403 }));
    expect(await fetchMyself("tok", "cloud-1")).toBeNull();
  });

  it("returns null when fetch itself rejects", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    expect(await fetchMyself("tok", "cloud-1")).toBeNull();
  });
});

describe("resolveAccountIdentity", () => {
  it("uses /me when it yields an account id", async () => {
    fetchMock.mockResolvedValue(json({ account_id: "acct-me", email: "m@x.co" }));
    const id = await resolveAccountIdentity("tok", "cloud-1");
    expect(id).toEqual({ accountId: "acct-me", email: "m@x.co" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to /myself on the given cloudId when /me fails", async () => {
    fetchMock.mockImplementation(async (url: unknown) => {
      const u = String(url);
      if (u.endsWith("/me")) return new Response("forbidden", { status: 403 });
      if (u.includes("/ex/jira/cloud-1/rest/api/3/myself")) return json({ accountId: "acct-7" });
      throw new Error(`unexpected fetch: ${u}`);
    });
    const id = await resolveAccountIdentity("tok", "cloud-1");
    expect(id).toEqual({ accountId: "acct-7", email: undefined });
  });

  it("discovers the cloudId via accessible-resources when none is given", async () => {
    fetchMock.mockImplementation(async (url: unknown) => {
      const u = String(url);
      if (u.endsWith("/me")) return new Response("forbidden", { status: 403 });
      if (u.includes("accessible-resources"))
        return json([{ id: "cloud-9", url: "", name: "", scopes: [] }]);
      if (u.includes("/ex/jira/cloud-9/rest/api/3/myself")) return json({ accountId: "acct-9" });
      throw new Error(`unexpected fetch: ${u}`);
    });
    const id = await resolveAccountIdentity("tok");
    expect(id.accountId).toBe("acct-9");
  });

  it("returns an empty accountId when every lookup fails", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const id = await resolveAccountIdentity("tok");
    expect(id).toEqual({ accountId: "" });
  });
});

describe("getValidSession accountId backfill", () => {
  const base = {
    accessToken: "tok",
    refreshToken: "r",
    // Far from expiry so the refresh branch never runs.
    expiresAt: Date.now() + 3_600_000,
    email: undefined as string | undefined,
  };

  it("resolves and persists a missing accountId", async () => {
    readMock.mockResolvedValue({ ...base, accountId: "" });
    fetchMock.mockImplementation(async (url: unknown) => {
      const u = String(url);
      if (u.endsWith("/me")) return new Response("forbidden", { status: 403 });
      if (u.includes("accessible-resources"))
        return json([{ id: "cloud-1", url: "", name: "", scopes: [] }]);
      if (u.includes("/rest/api/3/myself")) return json({ accountId: "acct-7" });
      throw new Error(`unexpected fetch: ${u}`);
    });
    const session = await getValidSession();
    expect(session.accountId).toBe("acct-7");
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "acct-7" }),
    );
  });

  it("returns the session unchanged when the backfill fails", async () => {
    readMock.mockResolvedValue({ ...base, accountId: "" });
    fetchMock.mockRejectedValue(new Error("offline"));
    const session = await getValidSession();
    expect(session.accountId).toBe("");
    expect(writeMock).not.toHaveBeenCalled();
  });

  it("leaves sessions that already have an accountId alone", async () => {
    readMock.mockResolvedValue({ ...base, accountId: "acct-9" });
    const session = await getValidSession();
    expect(session.accountId).toBe("acct-9");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writeMock).not.toHaveBeenCalled();
  });
});
