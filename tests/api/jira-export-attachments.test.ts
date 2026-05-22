// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/jira", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jira")>("@/lib/jira");
  return {
    ...actual,
    getValidSession: vi.fn(async () => ({ accessToken: "tok" })),
    uploadAttachmentBinary: vi.fn(async () => undefined),
  };
});

import { POST } from "@/app/api/jira/export-attachments/route";

function makeRequest(form: FormData): Request {
  return new Request("http://x/api/jira/export-attachments", {
    method: "POST",
    body: form,
  });
}

describe("POST /api/jira/export-attachments", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when cloudId is missing", async () => {
    const form = new FormData();
    form.append("issueKey", "PROJ-1");
    form.append("file", new File(["x"], "x.txt"));
    const res = await POST(makeRequest(form));
    expect(res.status).toBe(400);
  });

  it("returns 400 when file is missing", async () => {
    const form = new FormData();
    form.append("cloudId", "c1");
    form.append("issueKey", "PROJ-1");
    const res = await POST(makeRequest(form));
    expect(res.status).toBe(400);
  });

  it("returns 413 when file exceeds the configured max size", async () => {
    const oldMax = process.env.JIRA_DRAFT_ATTACHMENT_MAX_MB;
    process.env.JIRA_DRAFT_ATTACHMENT_MAX_MB = "1"; // 1 MB cap
    try {
      const form = new FormData();
      form.append("cloudId", "c1");
      form.append("issueKey", "PROJ-1");
      const oversize = new Uint8Array(1024 * 1024 + 1); // 1 MB + 1 byte
      form.append("file", new File([oversize], "big.bin"));
      const res = await POST(makeRequest(form));
      expect(res.status).toBe(413);
    } finally {
      process.env.JIRA_DRAFT_ATTACHMENT_MAX_MB = oldMax;
    }
  });

  it("forwards the file to uploadAttachmentBinary on success", async () => {
    const form = new FormData();
    form.append("cloudId", "c1");
    form.append("issueKey", "PROJ-1");
    form.append("file", new File(["hello"], "hello.txt", { type: "text/plain" }));
    const res = await POST(makeRequest(form));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
