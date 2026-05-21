import { describe, it, expect, beforeEach, vi } from "vitest";

// Routes are now gated by Jira session auth. Tests don't care about the gate;
// stub it so a session is always considered present.
vi.mock("@/lib/auth/requireSession", () => ({
  requireSession: vi.fn(async () => ({
    accessToken: "tok",
    refreshToken: "rt",
    expiresAt: Date.now() + 3_600_000,
    accountId: "acc-1",
    email: "test@example.com",
  })),
}));

vi.mock("@/lib/agent", async () => {
  const actual = await vi.importActual<typeof import("@/lib/agent")>("@/lib/agent");
  return {
    ...actual,
    runCreateDiagrams: vi.fn(() => new Promise<void>(() => {})), // never resolves
    makeTransport: vi.fn(() => ({ runRole: vi.fn() })),
  };
});

import { POST } from "@/app/api/diagrams/create/route";
import { _resetForTests } from "@/lib/jobs";

beforeEach(() => {
  _resetForTests();
  delete process.env.TASK_EMBED_ORIGINS;
});

function jsonReq(body: unknown, origin?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin) headers.origin = origin;
  return new Request("http://x/api/diagrams/create", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const validBody = {
  requirement: { title: "Sample requirement" },
  story: { title: "Sample story" },
  draft: { title: "T", description: "D" },
};

describe("POST /api/diagrams/create", () => {
  it("returns 200 + jobId for a valid body", async () => {
    const res = await POST(jsonReq(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.jobId).toMatch(/^j_/);
  });

  it("returns 400 for invalid JSON body", async () => {
    const r = new Request("http://x/api/diagrams/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    });
    const res = await POST(r);
    expect(res.status).toBe(400);
  });

  it("returns 400 when draft is missing required fields", async () => {
    const res = await POST(jsonReq({ ...validBody, draft: { title: "" } }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when formats contains an unknown value", async () => {
    const res = await POST(jsonReq({ ...validBody, formats: ["nope"] }));
    expect(res.status).toBe(400);
  });

  it("rejects 403 from origins not in TASK_EMBED_ORIGINS", async () => {
    process.env.TASK_EMBED_ORIGINS = "https://allowed.example";
    const res = await POST(jsonReq(validBody, "https://evil.example"));
    expect(res.status).toBe(403);
  });
});
