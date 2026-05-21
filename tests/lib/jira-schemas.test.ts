import { describe, it, expect } from "vitest";
import { ExportBodySchema } from "@/lib/jira/schemas";

const validStory = {
  title: "T",
  markdown: "# T\n\nDo the thing.",
};

describe("lib/jira/schemas.ExportBodySchema", () => {
  it("accepts a minimal valid body", () => {
    const r = ExportBodySchema.safeParse({
      cloudId: "abc",
      projectKey: "PROJ",
      issueTypeId: "10001",
      payload: { story: validStory },
    });
    expect(r.success).toBe(true);
  });

  it("rejects missing cloudId", () => {
    const r = ExportBodySchema.safeParse({
      projectKey: "PROJ",
      issueTypeId: "10001",
      payload: { story: validStory },
    });
    expect(r.success).toBe(false);
  });

  it("rejects malformed story (missing markdown)", () => {
    const r = ExportBodySchema.safeParse({
      cloudId: "abc",
      projectKey: "PROJ",
      issueTypeId: "10001",
      payload: { story: { ...validStory, markdown: "" } },
    });
    expect(r.success).toBe(false);
  });

  it("accepts diagrams record", () => {
    const r = ExportBodySchema.safeParse({
      cloudId: "abc",
      projectKey: "PROJ",
      issueTypeId: "10001",
      payload: { story: validStory },
      diagrams: { flow: "flowchart TD\n  A-->B" },
    });
    expect(r.success).toBe(true);
  });
});
