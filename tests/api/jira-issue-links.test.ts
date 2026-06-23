import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/jira", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jira")>("@/lib/jira");
  return {
    ...actual,
    getValidSession: vi.fn(async () => ({ accessToken: "tok" })),
    createIssueLink: vi.fn(async () => undefined),
  };
});

import { POST } from "@/app/api/jira/issue-links/route";
import { createIssueLink } from "@/lib/jira";

const link = vi.mocked(createIssueLink);

function request(body: unknown): Request {
  return new Request("http://x/api/jira/issue-links", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/jira/issue-links", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    link.mockResolvedValue(undefined);
  });

  it("returns 400 for invalid bodies", async () => {
    const res = await POST(request({ cloudId: "cid", links: [] }));
    expect(res.status).toBe(400);
  });

  it("creates issue links with outward blocker and inward blocked issue", async () => {
    const res = await POST(request({
      cloudId: "cid",
      links: [
        { linkTypeId: "10001", outwardIssueKey: "AI-1", inwardIssueKey: "AI-2" },
      ],
    }));
    expect(res.status).toBe(200);
    expect(link).toHaveBeenCalledWith("tok", "cid", {
      type: { id: "10001" },
      outwardIssue: { key: "AI-1" },
      inwardIssue: { key: "AI-2" },
    });
    expect(await res.json()).toEqual({
      results: {
        ok: [{ outwardIssueKey: "AI-1", inwardIssueKey: "AI-2" }],
        failed: [],
      },
    });
  });

  it("collects per-link failures without failing the route", async () => {
    link.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("already linked"));
    const res = await POST(request({
      cloudId: "cid",
      links: [
        { linkTypeId: "10001", outwardIssueKey: "AI-1", inwardIssueKey: "AI-2" },
        { linkTypeId: "10001", outwardIssueKey: "AI-3", inwardIssueKey: "AI-4" },
      ],
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      results: {
        ok: [{ outwardIssueKey: "AI-1", inwardIssueKey: "AI-2" }],
        failed: [{ outwardIssueKey: "AI-3", inwardIssueKey: "AI-4", error: "already linked" }],
      },
    });
  });
});
