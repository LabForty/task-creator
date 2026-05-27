import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/auth/requireSession", () => ({
  requireSession: vi.fn(async () => ({
    accessToken: "tok", refreshToken: "rt", expiresAt: Date.now() + 3_600_000,
    accountId: "acc-1", email: "test@example.com",
  })),
}));

import { POST } from "@/app/api/knead/route";

function makeReq(body: unknown, origin?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin) headers.origin = origin;
  return new Request("http://x/api/knead", { method: "POST", headers, body: JSON.stringify(body) });
}

describe("POST /api/knead (stub transport)", () => {
  const prev = process.env.TASK_AGENT_MODE;
  beforeEach(() => { process.env.TASK_AGENT_MODE = "stub"; });
  afterEach(() => { if (prev === undefined) delete process.env.TASK_AGENT_MODE; else process.env.TASK_AGENT_MODE = prev; });

  it("returns a questions outcome for round 1", async () => {
    const res = await POST(makeReq({ epicDescription: "An onboarding wizard", rounds: [] }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.kind).toBe("questions");
    expect(json.round.questions.length).toBeGreaterThan(0);
  });

  it("returns complete after a prior round", async () => {
    const res = await POST(makeReq({
      epicDescription: "An onboarding wizard",
      rounds: [{ questions: [], answers: {} }],
    }));
    const json = await res.json();
    expect(json.kind).toBe("complete");
  });

  it("returns 400 for an empty epic description", async () => {
    const res = await POST(makeReq({ epicDescription: "", rounds: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for malformed JSON", async () => {
    const r = new Request("http://x/api/knead", {
      method: "POST", headers: { "content-type": "application/json" }, body: "not-json",
    });
    expect((await POST(r)).status).toBe(400);
  });

  it("rejects a disallowed origin when TASK_EMBED_ORIGINS is set", async () => {
    process.env.TASK_EMBED_ORIGINS = "https://allowed.example";
    try {
      const res = await POST(makeReq({ epicDescription: "x", rounds: [] }, "https://evil.example"));
      expect(res.status).toBe(403);
    } finally {
      delete process.env.TASK_EMBED_ORIGINS;
    }
  });
});
