import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/jira", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jira")>("@/lib/jira");
  return {
    ...actual,
    getValidSession: vi.fn(async () => ({ accessToken: "tok" })),
    searchLabels: vi.fn(async (_t: string, _c: string, q: string) =>
      q === "back" ? ["backend", "backend-v2"] : [],
    ),
  };
});

import { GET } from "@/app/api/jira/labels/route";

describe("GET /api/jira/labels", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when cloudId is missing", async () => {
    const res = await GET(new Request("http://x/api/jira/labels?q=back"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when q is missing", async () => {
    const res = await GET(new Request("http://x/api/jira/labels?cloudId=c1"));
    expect(res.status).toBe(400);
  });

  it("returns labels for a valid query", async () => {
    const res = await GET(new Request("http://x/api/jira/labels?cloudId=c1&q=back"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ labels: ["backend", "backend-v2"] });
  });

  it("returns an empty array when nothing matches", async () => {
    const res = await GET(new Request("http://x/api/jira/labels?cloudId=c1&q=zzz"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ labels: [] });
  });
});
