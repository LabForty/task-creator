import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/auth/requireSession", () => ({
  requireSession: vi.fn(async () => ({ accessToken: "t", refreshToken: "r", expiresAt: Date.now() + 3_600_000, accountId: "a", email: "e@x.com" })),
}));

import { POST } from "@/app/api/refine/route";

const body = { epicDescription: "E", draft: { title: "t", description: "d", acceptanceCriteria: [], constraints: "" } };
function makeReq(b: unknown, origin?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin) headers.origin = origin;
  return new Request("http://x/api/refine", { method: "POST", headers, body: JSON.stringify(b) });
}

describe("POST /api/refine (stub)", () => {
  const prev = process.env.TASK_AGENT_MODE;
  beforeEach(() => { process.env.TASK_AGENT_MODE = "stub"; });
  afterEach(() => { if (prev === undefined) delete process.env.TASK_AGENT_MODE; else process.env.TASK_AGENT_MODE = prev; });

  it("returns a refined draft", async () => {
    const res = await POST(makeReq(body));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(typeof json.title).toBe("string");
    expect(Array.isArray(json.acceptanceCriteria)).toBe(true);
  });
  it("400 on empty epicDescription", async () => {
    expect((await POST(makeReq({ ...body, epicDescription: "" }))).status).toBe(400);
  });
  it("400 on malformed JSON", async () => {
    const r = new Request("http://x/api/refine", { method: "POST", headers: { "content-type": "application/json" }, body: "x" });
    expect((await POST(r)).status).toBe(400);
  });
  it("403 on disallowed origin", async () => {
    process.env.TASK_EMBED_ORIGINS = "https://allowed.example";
    try { expect((await POST(makeReq(body, "https://evil.example"))).status).toBe(403); }
    finally { delete process.env.TASK_EMBED_ORIGINS; }
  });
});
