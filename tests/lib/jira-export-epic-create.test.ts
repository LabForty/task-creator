import { describe, it, expect, vi, beforeEach } from "vitest";

const createIssueMock = vi.fn();
const listCreatableIssueTypesMock = vi.fn();

vi.mock("@/lib/jira/client", () => ({
  createIssue: (...args: unknown[]) => createIssueMock(...args),
  listCreateFields: vi.fn(async () => ({
    parent: { required: false, name: "Parent" },
  })),
  listCreatableIssueTypes: (...args: unknown[]) => listCreatableIssueTypesMock(...args),
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

const baseBody = {
  cloudId: "cloud-1",
  projectKey: "PROJ",
  issueTypeId: "10001",
  payload: { story: { title: "T", markdown: "# T" }, markdown: "# Edited" },
};

beforeEach(() => {
  createIssueMock.mockReset();
  listCreatableIssueTypesMock.mockReset();
});

describe("exportToJira — inline epic creation", () => {
  it("pre-creates an Epic and uses its key as the parent of the main issue", async () => {
    listCreatableIssueTypesMock.mockResolvedValue([
      { id: "10001", name: "Task" },
      { id: "10010", name: "Epic" },
    ]);
    createIssueMock
      .mockResolvedValueOnce({ key: "EPIC-200" }) // first call = Epic
      .mockResolvedValueOnce({ key: "PROJ-100" }); // second call = main

    const result = await exportToJira("tok", {
      ...baseBody,
      metadata: { epic: { kind: "new", title: "New epic from task creator" } },
    });

    expect(createIssueMock).toHaveBeenCalledTimes(2);
    expect(createIssueMock.mock.calls[0][2].issuetype).toEqual({ id: "10010" });
    expect(createIssueMock.mock.calls[0][2].summary).toBe("New epic from task creator");
    expect(createIssueMock.mock.calls[1][2].parent).toEqual({ key: "EPIC-200" });
    expect(result.epicCreated).toEqual({ key: "EPIC-200" });
  });

  it("throws a structured error when no Epic issuetype exists in the project", async () => {
    listCreatableIssueTypesMock.mockResolvedValue([{ id: "10001", name: "Task" }]);
    await expect(
      exportToJira("tok", {
        ...baseBody,
        metadata: { epic: { kind: "new", title: "Will fail" } },
      }),
    ).rejects.toThrow(/no Epic issuetype/i);
    expect(createIssueMock).not.toHaveBeenCalled();
  });
});
