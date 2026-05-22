import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { createIssueLink, addComment } from "@/lib/jira/client";

describe("lib/jira/client extra helpers", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(null, { status: 201 }));
  });

  it("createIssueLink POSTs to /issueLink with the link payload", async () => {
    await createIssueLink("tok", "cloud-1", {
      type: { id: "10001" },
      inwardIssue: { key: "ABC-1" },
      outwardIssue: { key: "PROJ-9" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/rest/api/3/issueLink");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({
      type: { id: "10001" },
      inwardIssue: { key: "ABC-1" },
      outwardIssue: { key: "PROJ-9" },
    });
  });

  it("addComment POSTs ADF body to /issue/{key}/comment", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "c1" }), { status: 201 }));
    const adf = { type: "doc", version: 1, content: [] };
    await addComment("tok", "cloud-1", "PROJ-9", adf);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/rest/api/3/issue/PROJ-9/comment");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({ body: adf });
  });
});
