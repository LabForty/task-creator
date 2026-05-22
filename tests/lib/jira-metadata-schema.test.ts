import { describe, it, expect } from "vitest";
import { ExportBodySchema } from "@/lib/jira/schemas";

const baseBody = {
  cloudId: "cloud-1",
  projectKey: "PROJ",
  issueTypeId: "10001",
  payload: {
    story: { title: "t", markdown: "# t\n\n## Acceptance Criteria\n- a" },
    markdown: "# edited",
  },
};

describe("ExportBodySchema.metadata", () => {
  it("accepts a body with no metadata at all", () => {
    const r = ExportBodySchema.safeParse(baseBody);
    expect(r.success).toBe(true);
  });

  it("accepts a fully populated metadata block", () => {
    const r = ExportBodySchema.safeParse({
      ...baseBody,
      metadata: {
        labels: ["backend", "v2"],
        linkedIssues: [{ key: "ABC-1", linkTypeId: "10000" }],
        flagged: true,
        flagReason: "blocked on auth refactor",
        epic: { kind: "existing", key: "EPIC-9" },
      },
    });
    expect(r.success).toBe(true);
  });

  it("rejects flagged=true without flagReason", () => {
    const r = ExportBodySchema.safeParse({
      ...baseBody,
      metadata: { flagged: true },
    });
    expect(r.success).toBe(false);
  });

  it("rejects a label longer than 255 chars", () => {
    const r = ExportBodySchema.safeParse({
      ...baseBody,
      metadata: { labels: ["x".repeat(256)] },
    });
    expect(r.success).toBe(false);
  });

  it("rejects a malformed linked-issue key", () => {
    const r = ExportBodySchema.safeParse({
      ...baseBody,
      metadata: { linkedIssues: [{ key: "abc-1", linkTypeId: "10000" }] },
    });
    expect(r.success).toBe(false);
  });

  it("rejects epic.kind=new without a title", () => {
    const r = ExportBodySchema.safeParse({
      ...baseBody,
      metadata: { epic: { kind: "new", title: "" } },
    });
    expect(r.success).toBe(false);
  });
});
