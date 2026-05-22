import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/jira/client", () => ({
  createIssue: vi.fn(async () => ({ key: "PROJ-123" })),
  listCreateFields: vi.fn(async () => ({})),
  uploadAttachment: vi.fn(async () => undefined),
}));

vi.mock("@/lib/jira/oauth", () => ({
  listAccessibleResources: vi.fn(async () => [
    { id: "cloud-1", url: "https://example.atlassian.net" },
  ]),
}));

import { exportToJira } from "@/lib/jira/export";
import { createIssue } from "@/lib/jira/client";

const createIssueMock = vi.mocked(createIssue);

describe("lib/jira/export.exportToJira — AI-34 edited markdown is the description source", () => {
  beforeEach(() => {
    createIssueMock.mockClear();
  });

  it("builds the description from payload.markdown, not story.markdown", async () => {
    const storyMarkdown = [
      "# Original",
      "",
      "Planner output that the user no longer wants.",
      "",
      "## Acceptance Criteria",
      "- Original AC",
    ].join("\n");

    const editedMarkdown = [
      "# Edited",
      "",
      "What the user actually wants exported.",
      "",
      "## Acceptance Criteria",
      "- Edited AC",
    ].join("\n");

    await exportToJira("token", {
      cloudId: "cloud-1",
      projectKey: "PROJ",
      issueTypeId: "10001",
      payload: {
        story: { title: "Some title", markdown: storyMarkdown },
        markdown: editedMarkdown,
      },
    });

    expect(createIssueMock).toHaveBeenCalledTimes(1);
    const [, , fields] = createIssueMock.mock.calls[0];
    const description = JSON.stringify(fields.description);

    expect(description).toContain("Edited");
    expect(description).toContain("What the user actually wants exported.");
    expect(description).not.toContain("Original");
    expect(description).not.toContain("Planner output that the user no longer wants.");
  });

  it("keeps story.title as the issue summary even when markdown is edited", async () => {
    await exportToJira("token", {
      cloudId: "cloud-1",
      projectKey: "PROJ",
      issueTypeId: "10001",
      payload: {
        story: { title: "Summary stays", markdown: "# Body\n\n## Acceptance Criteria\n- a" },
        markdown: "# Edited body\n\n## Acceptance Criteria\n- a",
      },
    });

    const [, , fields] = createIssueMock.mock.calls[0];
    expect(fields.summary).toBe("Summary stays");
  });
});
