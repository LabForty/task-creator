import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/auth/requireSession", () => ({
  requireSession: vi.fn(async () => ({
    accessToken: "tok", refreshToken: "rt", expiresAt: Date.now() + 3_600_000, accountId: "a", email: "t@e.com",
  })),
}));

import { POST } from "@/app/api/subtasks/route";

function makeReq(body: unknown, origin?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin) headers.origin = origin;
  return new Request("http://x/api/subtasks", { method: "POST", headers, body: JSON.stringify(body) });
}

describe("POST /api/subtasks (stub)", () => {
  const prev = process.env.TASK_AGENT_MODE;
  beforeEach(() => { process.env.TASK_AGENT_MODE = "stub"; });
  afterEach(() => { if (prev === undefined) delete process.env.TASK_AGENT_MODE; else process.env.TASK_AGENT_MODE = prev; });

  it("returns a subtasks array", async () => {
    const res = await POST(makeReq({ epicDescription: "An epic", rounds: [] }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.subtasks.length).toBe(2);
  });

  it("400 on empty epicDescription", async () => {
    expect((await POST(makeReq({ epicDescription: "", rounds: [] }))).status).toBe(400);
  });

  it("400 on malformed JSON", async () => {
    const r = new Request("http://x/api/subtasks", { method: "POST", headers: { "content-type": "application/json" }, body: "x" });
    expect((await POST(r)).status).toBe(400);
  });

  it("403 on disallowed origin when allowlist set", async () => {
    process.env.TASK_EMBED_ORIGINS = "https://allowed.example";
    try {
      expect((await POST(makeReq({ epicDescription: "x", rounds: [] }, "https://evil.example"))).status).toBe(403);
    } finally { delete process.env.TASK_EMBED_ORIGINS; }
  });
});
