import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/jira", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jira")>("@/lib/jira");
  return {
    ...actual,
    getValidSession: vi.fn(async () => ({ accessToken: "tok" })),
    searchIssues: vi.fn(async () => [
      { key: "ABC-1", title: "Add export" },
      { key: "ABC-2", title: "Fix import" },
    ]),
  };
});

import { GET } from "@/app/api/jira/issue-search/route";
import { searchIssues } from "@/lib/jira";

describe("GET /api/jira/issue-search", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when q is shorter than 2 chars", async () => {
    const res = await GET(new Request("http://x/api/jira/issue-search?cloudId=c1&q=a"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when cloudId is missing", async () => {
    const res = await GET(new Request("http://x/api/jira/issue-search?q=add"));
    expect(res.status).toBe(400);
  });

  it("builds an OR query of text and key when q does not look like a key", async () => {
    await GET(new Request("http://x/api/jira/issue-search?cloudId=c1&q=add"));
    const jqlArg = vi.mocked(searchIssues).mock.calls[0][2];
    expect(jqlArg).toContain('text ~ "add"');
  });

  it("uses `key = ...` when q looks like a Jira key", async () => {
    await GET(new Request("http://x/api/jira/issue-search?cloudId=c1&q=AI-35"));
    const jqlArg = vi.mocked(searchIssues).mock.calls[0][2];
    expect(jqlArg).toContain('key = "AI-35"');
  });

  it("returns the searched issues in the response", async () => {
    const res = await GET(new Request("http://x/api/jira/issue-search?cloudId=c1&q=add"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      issues: [
        { key: "ABC-1", title: "Add export" },
        { key: "ABC-2", title: "Fix import" },
      ],
    });
  });
});
