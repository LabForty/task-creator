import { describe, it, expect } from "vitest";
import { ExportBodySchema } from "@/lib/jira/schemas";

const validStory = {
  title: "T",
  userStory: { asA: "a", iWant: "b", soThat: "c" },
  description: "d",
  acceptanceCriteria: [{ title: "S", given: ["g"], when: ["w"], then: ["t"] }],
  definitionOfDone: ["done"],
  notes: "",
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

  it("rejects malformed story", () => {
    const r = ExportBodySchema.safeParse({
      cloudId: "abc",
      projectKey: "PROJ",
      issueTypeId: "10001",
      payload: { story: { ...validStory, acceptanceCriteria: [] } },
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
