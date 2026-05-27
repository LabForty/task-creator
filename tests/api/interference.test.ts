import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/auth/requireSession", () => ({
  requireSession: vi.fn(async () => ({ accessToken: "t", refreshToken: "r", expiresAt: Date.now() + 3_600_000, accountId: "a", email: "e@x.com" })),
}));

import { POST } from "@/app/api/interference/route";

const st = (id: string) => ({ id, title: id, description: "", labels: [], blocks: [], blockedBy: [] });
function makeReq(body: unknown, origin?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin) headers.origin = origin;
  return new Request("http://x/api/interference", { method: "POST", headers, body: JSON.stringify(body) });
}

describe("POST /api/interference (stub)", () => {
  const prev = process.env.TASK_AGENT_MODE;
  beforeEach(() => { process.env.TASK_AGENT_MODE = "stub"; });
  afterEach(() => { if (prev === undefined) delete process.env.TASK_AGENT_MODE; else process.env.TASK_AGENT_MODE = prev; });

  it("returns interference warnings", async () => {
    const res = await POST(makeReq({ epicDescription: "E", editedSubtask: st("a"), allSubtasks: [st("a"), st("b")] }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.interference[0].affectedTaskId).toBe("b");
    expect(json.interference[0].sourceTaskId).toBe("a");
  });

  it("400 on empty epicDescription", async () => {
    expect((await POST(makeReq({ epicDescription: "", editedSubtask: st("a"), allSubtasks: [] }))).status).toBe(400);
  });

  it("400 on malformed JSON", async () => {
    const r = new Request("http://x/api/interference", { method: "POST", headers: { "content-type": "application/json" }, body: "x" });
    expect((await POST(r)).status).toBe(400);
  });

  it("403 on disallowed origin", async () => {
    process.env.TASK_EMBED_ORIGINS = "https://allowed.example";
    try {
      expect((await POST(makeReq({ epicDescription: "E", editedSubtask: st("a"), allSubtasks: [] }, "https://evil.example"))).status).toBe(403);
    } finally { delete process.env.TASK_EMBED_ORIGINS; }
  });
});
