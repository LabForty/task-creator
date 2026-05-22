import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/jira/client", () => ({
  createIssue: vi.fn(async () => ({ key: "PROJ-100" })),
  listCreateFields: vi.fn(async () => ({})),
  listCreatableIssueTypes: vi.fn(),
  uploadAttachment: vi.fn(async () => undefined),
  createIssueLink: vi.fn(async () => undefined),
  addComment: vi.fn(async () => ({ id: "c1" })),
}));

vi.mock("@/lib/jira/oauth", () => ({
  listAccessibleResources: vi.fn(async () => [
    { id: "cloud-1", url: "https://example.atlassian.net" },
  ]),
}));

import { exportToJira } from "@/lib/jira/export";
import { createIssueLink, addComment } from "@/lib/jira/client";

const link = vi.mocked(createIssueLink);
const comment = vi.mocked(addComment);

const baseBody = {
  cloudId: "cloud-1",
  projectKey: "PROJ",
  issueTypeId: "10001",
  payload: { story: { title: "T", markdown: "# T" }, markdown: "# Edited" },
};

beforeEach(() => {
  link.mockClear();
  link.mockResolvedValue(undefined);
  comment.mockClear();
  comment.mockResolvedValue({ id: "c1" });
});

describe("exportToJira — post-create steps", () => {
  it("creates one issue link per linkedIssue, in parallel, with outward = main issue", async () => {
    const result = await exportToJira("tok", {
      ...baseBody,
      metadata: {
        linkedIssues: [
          { key: "ABC-1", linkTypeId: "10000" },
          { key: "ABC-2", linkTypeId: "10001" },
        ],
      },
    });
    expect(link).toHaveBeenCalledTimes(2);
    expect(link.mock.calls[0][2]).toEqual({
      type: { id: "10000" },
      inwardIssue: { key: "ABC-1" },
      outwardIssue: { key: "PROJ-100" },
    });
    expect(result.linkResults?.ok).toEqual(["ABC-1", "ABC-2"]);
    expect(result.linkResults?.failed).toEqual([]);
  });

  it("collects per-link failures without aborting the export", async () => {
    link.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("link-fail"));
    const result = await exportToJira("tok", {
      ...baseBody,
      metadata: {
        linkedIssues: [
          { key: "ABC-1", linkTypeId: "10000" },
          { key: "ABC-2", linkTypeId: "10001" },
        ],
      },
    });
    expect(result.linkResults?.ok).toEqual(["ABC-1"]);
    expect(result.linkResults?.failed).toEqual([{ key: "ABC-2", error: "link-fail" }]);
  });

  it("posts a 'Flagged: <reason>' comment when flagged=true with a reason", async () => {
    const result = await exportToJira("tok", {
      ...baseBody,
      metadata: { flagged: true, flagReason: "blocked on auth refactor" },
    });
    expect(comment).toHaveBeenCalledTimes(1);
    const [, , issueKey, adf] = comment.mock.calls[0];
    expect(issueKey).toBe("PROJ-100");
    expect(JSON.stringify(adf)).toContain("Flagged: blocked on auth refactor");
    expect(result.flagCommentResult).toBe("ok");
  });

  it("does not post a comment when flagged is false", async () => {
    await exportToJira("tok", { ...baseBody, metadata: { flagged: false } });
    expect(comment).not.toHaveBeenCalled();
  });

  it("collects flag-comment failure without aborting", async () => {
    comment.mockRejectedValueOnce(new Error("comment-fail"));
    const result = await exportToJira("tok", {
      ...baseBody,
      metadata: { flagged: true, flagReason: "x".repeat(20) },
    });
    expect(result.flagCommentResult).toBe("failed");
    expect(result.flagCommentError).toBe("comment-fail");
  });
});
