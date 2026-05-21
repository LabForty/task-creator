import { describe, it, expect, beforeEach, vi } from "vitest";

// SSE stream route is gated by Jira session auth. Stub the gate so a session
// is always present in this suite.
vi.mock("@/lib/auth/requireSession", () => ({
  requireSession: vi.fn(async () => ({
    accessToken: "tok",
    refreshToken: "rt",
    expiresAt: Date.now() + 3_600_000,
    accountId: "acc-1",
    email: "test@example.com",
  })),
}));

import { GET } from "@/app/api/jobs/[id]/stream/route";
import { createJob, publish, _resetForTests } from "@/lib/jobs";

beforeEach(() => _resetForTests());

async function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const { value, done } = await reader.read();
  if (done || !value) return "";
  return new TextDecoder().decode(value);
}

describe("GET /api/jobs/:id/stream", () => {
  it("returns content-type: text/event-stream", async () => {
    const job = createJob();
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: job.id }) });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    res.body?.cancel();
  });

  it("replays past events to a late subscriber", async () => {
    const job = createJob();
    publish(job.id, { type: "role_started", role: "analyst" });
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: job.id }) });
    const reader = res.body!.getReader();
    const chunk = await readChunk(reader);
    expect(chunk).toContain("event: role_started");
    expect(chunk).toContain('"role":"analyst"');
    reader.cancel();
  });

  it("emits subsequent events to live subscribers", async () => {
    const job = createJob();
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: job.id }) });
    const reader = res.body!.getReader();
    publish(job.id, { type: "role_progress", role: "planner", message: "thinking" });
    const chunk = await readChunk(reader);
    expect(chunk).toContain("event: role_progress");
    expect(chunk).toContain('"role":"planner"');
    reader.cancel();
  });

  it("closes the stream after a finalized event", async () => {
    const job = createJob();
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: job.id }) });
    const reader = res.body!.getReader();
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
    // drain one chunk (the finalized event) then expect 'done'.
    await readChunk(reader);
    const next = await reader.read();
    expect(next.done).toBe(true);
  });

  it("closes the stream after an error event", async () => {
    const job = createJob();
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: job.id }) });
    const reader = res.body!.getReader();
    publish(job.id, { type: "error", code: "E_X", message: "x", retriable: false });
    await readChunk(reader);
    const next = await reader.read();
    expect(next.done).toBe(true);
  });

  it("returns 404 for an unknown job", async () => {
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "j_missing" }) });
    expect(res.status).toBe(404);
  });

  it("if the job is already terminal at subscribe time, replays past events and closes", async () => {
    const job = createJob();
    publish(job.id, { type: "error", code: "E_AUTH", message: "401", retriable: false });
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: job.id }) });
    const reader = res.body!.getReader();
    const chunk = await readChunk(reader);
    expect(chunk).toContain("event: error");
    expect(chunk).toContain("E_AUTH");
    const next = await reader.read();
    expect(next.done).toBe(true);
  });
});
