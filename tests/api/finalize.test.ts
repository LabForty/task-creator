import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/finalize", () => ({
  // Never resolves — keeps the inflight entry set so rate-limit + happy-path
  // tests can both observe the post-submission state without racing the
  // route's finally{} cleanup.
  runFinalize: vi.fn(() => new Promise<void>(() => {})),
}));

import { POST } from "@/app/api/finalize/route";
import { GET as GET_JOB } from "@/app/api/jobs/[id]/route";
import { _resetForTests, createJob, publish } from "@/lib/jobs";
import { _clearInflightForTests } from "@/app/api/finalize/route";

function makeReq(body: unknown, init: { ip?: string; origin?: string } = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.ip) headers["x-forwarded-for"] = init.ip;
  if (init.origin) headers.origin = init.origin;
  return new Request("http://x/api/finalize", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  _resetForTests();
  _clearInflightForTests();
  delete process.env.TASK_EMBED_ORIGINS;
});

describe("POST /api/finalize", () => {
  it("returns 200 + jobId for a valid draft", async () => {
    const res = await POST(makeReq({ draft: { title: "T", description: "D" } }, { ip: "1.1.1.1" }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.jobId).toMatch(/^j_/);
  });

  it("returns 400 for an invalid draft (empty title)", async () => {
    const res = await POST(makeReq({ draft: { title: "", description: "D" } }, { ip: "2.2.2.2" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for malformed JSON body", async () => {
    const r = new Request("http://x/api/finalize", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "3.3.3.3" },
      body: "not-json",
    });
    const res = await POST(r);
    expect(res.status).toBe(400);
  });

  it("returns 429 when the same IP already has a running job", async () => {
    const first = await POST(makeReq({ draft: { title: "A", description: "D" } }, { ip: "4.4.4.4" }));
    expect(first.status).toBe(200);
    const second = await POST(makeReq({ draft: { title: "B", description: "D" } }, { ip: "4.4.4.4" }));
    expect(second.status).toBe(429);
  });

  it("allows a second job from a different IP", async () => {
    const a = await POST(makeReq({ draft: { title: "A", description: "D" } }, { ip: "5.5.5.5" }));
    const b = await POST(makeReq({ draft: { title: "B", description: "D" } }, { ip: "6.6.6.6" }));
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
  });

  it("rejects POST from origins not in TASK_EMBED_ORIGINS when allowlist is set", async () => {
    process.env.TASK_EMBED_ORIGINS = "https://allowed.example";
    const res = await POST(
      makeReq({ draft: { title: "T", description: "D" } }, { ip: "7.7.7.7", origin: "https://evil.example" }),
    );
    expect(res.status).toBe(403);
  });

  it("allows POST when origin is on the allowlist", async () => {
    process.env.TASK_EMBED_ORIGINS = "https://allowed.example, https://other.example";
    const res = await POST(
      makeReq({ draft: { title: "T", description: "D" } }, { ip: "8.8.8.8", origin: "https://other.example" }),
    );
    expect(res.status).toBe(200);
  });
});

describe("GET /api/jobs/:id", () => {
  it("returns the job snapshot for a known id", async () => {
    const job = createJob();
    const res = await GET_JOB(new Request("http://x"), { params: Promise.resolve({ id: job.id }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("running");
  });

  it("returns finalized status and result after a finalized event", async () => {
    const job = createJob();
    publish(job.id, {
      type: "finalized",
      payload: {
        requirement: { title: "Sample req" } as never,
        story: { title: "Sample story" } as never,
        gates: { schema: { gate: "schema", ok: true }, consistency: { gate: "consistency", ok: true } },
        markdown: "x",
        downloadUrls: { requirement: "/r", story: "/s", markdown: "/m" },
      },
    });
    const res = await GET_JOB(new Request("http://x"), { params: Promise.resolve({ id: job.id }) });
    const json = await res.json();
    expect(json.status).toBe("finalized");
    expect(json.result.requirement.title).toBe("Sample req");
  });

  it("returns 404 for unknown job", async () => {
    const res = await GET_JOB(new Request("http://x"), { params: Promise.resolve({ id: "j_missing" }) });
    expect(res.status).toBe(404);
  });
});
