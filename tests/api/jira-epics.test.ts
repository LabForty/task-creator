import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/jira", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jira")>("@/lib/jira");
  return {
    ...actual,
    getValidSession: vi.fn(async () => ({ accessToken: "tok" })),
    searchIssues: vi.fn(async () => [
      { key: "EPIC-9", title: "Auth rework" },
      { key: "EPIC-10", title: "Reporting v2" },
    ]),
  };
});

import { GET } from "@/app/api/jira/epics/route";
import { searchIssues } from "@/lib/jira";

describe("GET /api/jira/epics", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when cloudId or projectKey missing", async () => {
    const res1 = await GET(new Request("http://x/api/jira/epics?projectKey=PROJ"));
    const res2 = await GET(new Request("http://x/api/jira/epics?cloudId=c1"));
    expect(res1.status).toBe(400);
    expect(res2.status).toBe(400);
  });

  it("builds a JQL filtered by project and Epic type, excluding Done", async () => {
    await GET(new Request("http://x/api/jira/epics?cloudId=c1&projectKey=PROJ"));
    const jql = vi.mocked(searchIssues).mock.calls[0][2];
    expect(jql).toContain('project = "PROJ"');
    expect(jql).toContain("issuetype = Epic");
    expect(jql).toContain("statusCategory != Done");
  });

  it("appends summary/key filter when q is provided", async () => {
    await GET(new Request("http://x/api/jira/epics?cloudId=c1&projectKey=PROJ&q=auth"));
    const jql = vi.mocked(searchIssues).mock.calls[0][2];
    expect(jql).toContain('summary ~ "auth"');
  });

  it("returns the epic list", async () => {
    const res = await GET(new Request("http://x/api/jira/epics?cloudId=c1&projectKey=PROJ"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      epics: [
        { key: "EPIC-9", title: "Auth rework" },
        { key: "EPIC-10", title: "Reporting v2" },
      ],
    });
  });
});
