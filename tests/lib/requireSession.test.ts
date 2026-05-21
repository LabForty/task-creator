import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sanitizeReturnPath } from "@/lib/auth/returnPath";

describe("sanitizeReturnPath", () => {
  it("returns '/' for null, undefined, and empty input", () => {
    expect(sanitizeReturnPath(null)).toBe("/");
    expect(sanitizeReturnPath(undefined)).toBe("/");
    expect(sanitizeReturnPath("")).toBe("/");
  });

  it("rejects absolute URLs", () => {
    expect(sanitizeReturnPath("https://evil.com")).toBe("/");
    expect(sanitizeReturnPath("http://localhost:3000/x")).toBe("/");
  });

  it("rejects protocol-relative URLs", () => {
    expect(sanitizeReturnPath("//evil.com")).toBe("/");
    expect(sanitizeReturnPath("//evil.com/path")).toBe("/");
  });

  it("rejects paths containing backslashes", () => {
    expect(sanitizeReturnPath("/\\evil.com")).toBe("/");
    expect(sanitizeReturnPath("/path\\with\\backslash")).toBe("/");
  });

  it("accepts ordinary same-origin paths", () => {
    expect(sanitizeReturnPath("/")).toBe("/");
    expect(sanitizeReturnPath("/embed")).toBe("/embed");
    expect(sanitizeReturnPath("/embed?returnOrigin=https%3A%2F%2Fhost")).toBe(
      "/embed?returnOrigin=https%3A%2F%2Fhost",
    );
    expect(sanitizeReturnPath("/foo/bar#section")).toBe("/foo/bar#section");
  });

  it("rejects non-string input defensively", () => {
    // @ts-expect-error — exercising defensive runtime guard
    expect(sanitizeReturnPath(42)).toBe("/");
    // @ts-expect-error
    expect(sanitizeReturnPath({})).toBe("/");
  });
});

// requireSession() depends on the Jira config + session store. Rather than
// pulling in next/server's NextResponse mock, we exercise it by stubbing
// the @/lib/jira module to control branching.
describe("requireSession", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("returns a 503 NextResponse when Jira is not configured", async () => {
    vi.doMock("@/lib/jira", async () => {
      const actual = await vi.importActual<typeof import("@/lib/jira")>("@/lib/jira");
      return {
        ...actual,
        isConfigured: () => false,
        getValidSession: vi.fn(),
      };
    });
    const { requireSession } = await import("@/lib/auth/requireSession");
    const result = await requireSession();
    // NextResponse is a Response subclass.
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(503);
    const body = await (result as Response).json();
    expect(body).toEqual({ error: "jira_not_configured" });
  });

  it("returns 401 when no Jira session is present", async () => {
    const { JiraError } = await import("@/lib/jira/errors");
    vi.doMock("@/lib/jira", async () => {
      const actual = await vi.importActual<typeof import("@/lib/jira")>("@/lib/jira");
      return {
        ...actual,
        isConfigured: () => true,
        getValidSession: vi.fn().mockRejectedValue(
          new JiraError("not_connected", "no session", 401),
        ),
      };
    });
    const { requireSession } = await import("@/lib/auth/requireSession");
    const result = await requireSession();
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
    const body = await (result as Response).json();
    expect(body).toEqual({ error: "not_authenticated" });
  });

  it("returns 401 on refresh failure (any other error)", async () => {
    vi.doMock("@/lib/jira", async () => {
      const actual = await vi.importActual<typeof import("@/lib/jira")>("@/lib/jira");
      return {
        ...actual,
        isConfigured: () => true,
        getValidSession: vi.fn().mockRejectedValue(new Error("network glitch")),
      };
    });
    const { requireSession } = await import("@/lib/auth/requireSession");
    const result = await requireSession();
    expect((result as Response).status).toBe(401);
  });

  it("returns the session when valid", async () => {
    const fakeSession = {
      accessToken: "tok",
      refreshToken: "rt",
      expiresAt: Date.now() + 3_600_000,
      accountId: "abc",
      email: "user@example.com",
    };
    vi.doMock("@/lib/jira", async () => {
      const actual = await vi.importActual<typeof import("@/lib/jira")>("@/lib/jira");
      return {
        ...actual,
        isConfigured: () => true,
        getValidSession: vi.fn().mockResolvedValue(fakeSession),
      };
    });
    const { requireSession } = await import("@/lib/auth/requireSession");
    const result = await requireSession();
    expect(result).toEqual(fakeSession);
  });
});
