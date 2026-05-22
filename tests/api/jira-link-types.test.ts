import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/jira", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jira")>("@/lib/jira");
  return {
    ...actual,
    getValidSession: vi.fn(async () => ({ accessToken: "tok" })),
    listLinkTypes: vi.fn(async () => [
      { id: "10000", name: "Relates", inward: "relates to", outward: "relates to" },
      { id: "10001", name: "Blocks", inward: "is blocked by", outward: "blocks" },
    ]),
  };
});

import { GET } from "@/app/api/jira/link-types/route";

describe("GET /api/jira/link-types", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when cloudId is missing", async () => {
    const res = await GET(new Request("http://x/api/jira/link-types"));
    expect(res.status).toBe(400);
  });

  it("returns the link-types list", async () => {
    const res = await GET(new Request("http://x/api/jira/link-types?cloudId=c1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      linkTypes: [
        { id: "10000", name: "Relates", inward: "relates to", outward: "relates to" },
        { id: "10001", name: "Blocks", inward: "is blocked by", outward: "blocks" },
      ],
    });
  });
});
