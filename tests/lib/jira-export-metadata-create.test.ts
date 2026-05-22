import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/jira/client", () => ({
  createIssue: vi.fn(async () => ({ key: "PROJ-100" })),
  listCreateFields: vi.fn(),
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
import { createIssue, listCreateFields } from "@/lib/jira/client";

const create = vi.mocked(createIssue);
const meta = vi.mocked(listCreateFields);

const baseBody = {
  cloudId: "cloud-1",
  projectKey: "PROJ",
  issueTypeId: "10001",
  payload: {
    story: { title: "T", markdown: "# T" },
    markdown: "# Edited",
  },
};

describe("exportToJira — metadata routed into createIssue", () => {
  beforeEach(() => {
    create.mockClear();
    meta.mockReset();
  });

  it("sets fields.labels when labels system field exists and metadata.labels has values", async () => {
    meta.mockResolvedValue({
      labels: { required: false, name: "Labels" },
    } as any);
    await exportToJira("tok", { ...baseBody, metadata: { labels: ["backend", "v2"] } });
    expect(create.mock.calls[0][2].labels).toEqual(["backend", "v2"]);
  });

  it("skips labels when project lacks a labels field", async () => {
    meta.mockResolvedValue({} as any);
    await exportToJira("tok", { ...baseBody, metadata: { labels: ["backend"] } });
    expect(create.mock.calls[0][2].labels).toBeUndefined();
  });

  it("sets `parent` for team-managed epic when epic.kind=existing", async () => {
    meta.mockResolvedValue({ parent: { required: false, name: "Parent" } } as any);
    await exportToJira("tok", {
      ...baseBody,
      metadata: { epic: { kind: "existing", key: "EPIC-9" } },
    });
    expect(create.mock.calls[0][2].parent).toEqual({ key: "EPIC-9" });
  });

  it("sets the custom Epic Link field for company-managed projects", async () => {
    meta.mockResolvedValue({
      customfield_10014: {
        required: false,
        name: "Epic Link",
        schema: { type: "any", custom: "com.pyxis.greenhopper.jira:gh-epic-link" },
      },
    } as any);
    await exportToJira("tok", {
      ...baseBody,
      metadata: { epic: { kind: "existing", key: "EPIC-9" } },
    });
    expect(create.mock.calls[0][2].customfield_10014).toBe("EPIC-9");
  });

  it("sets Flagged field when metadata.flagged is true and Flagged field exists", async () => {
    meta.mockResolvedValue({
      customfield_10021: {
        required: false,
        name: "Flagged",
        schema: { type: "array", items: "option" },
      },
    } as any);
    await exportToJira("tok", {
      ...baseBody,
      metadata: { flagged: true, flagReason: "needs auth refactor" },
    });
    expect(create.mock.calls[0][2].customfield_10021).toEqual([{ value: "Impediment" }]);
  });
});
