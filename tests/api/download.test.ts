import { describe, it, expect, beforeEach, vi } from "vitest";

// Download route is gated by Jira session auth. Stub the gate so a session
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

import { GET } from "@/app/api/jobs/[id]/download/[artifact]/route";
import { createJob, publish, _resetForTests } from "@/lib/jobs";
import type { FinalizedPayload } from "@/lib/jobs/types";

beforeEach(() => _resetForTests());

const samplePayload: FinalizedPayload = {
  requirement: { title: "Sample requirement" } as never,
  story: { title: "Sample story" } as never,
  gates: {
    schema: { gate: "schema", ok: true },
    consistency: { gate: "consistency", ok: true },
  },
  markdown: "# Title\nbody text",
  downloadUrls: { requirement: "", story: "", markdown: "" },
};

function finalizedJob() {
  const job = createJob();
  publish(job.id, { type: "finalized", payload: samplePayload });
  return job;
}

describe("GET /api/jobs/:id/download/:artifact", () => {
  it("returns requirement JSON with a slug-based filename", async () => {
    const job = finalizedJob();
    const res = await GET(new Request("http://x"), {
      params: Promise.resolve({ id: job.id, artifact: "requirement" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("content-disposition")).toContain("requirement-sample-requirement.json");
    const body = JSON.parse(await res.text());
    expect(body.title).toBe("Sample requirement");
  });

  it("returns story JSON with a slug-based filename", async () => {
    const job = finalizedJob();
    const res = await GET(new Request("http://x"), {
      params: Promise.resolve({ id: job.id, artifact: "story" }),
    });
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("content-disposition")).toContain("story-sample-story.json");
    const body = JSON.parse(await res.text());
    expect(body.title).toBe("Sample story");
  });

  it("returns rendered markdown for the markdown artifact", async () => {
    const job = finalizedJob();
    const res = await GET(new Request("http://x"), {
      params: Promise.resolve({ id: job.id, artifact: "markdown" }),
    });
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(res.headers.get("content-disposition")).toContain("finalized.md");
    expect(await res.text()).toBe("# Title\nbody text");
  });

  it("404s for unknown artifact name", async () => {
    const job = finalizedJob();
    const res = await GET(new Request("http://x"), {
      params: Promise.resolve({ id: job.id, artifact: "nope" }),
    });
    expect(res.status).toBe(404);
  });

  it("404s for unknown job id", async () => {
    const res = await GET(new Request("http://x"), {
      params: Promise.resolve({ id: "j_missing", artifact: "requirement" }),
    });
    expect(res.status).toBe(404);
  });

  it("404s when job exists but has no result yet (still running)", async () => {
    const job = createJob();
    const res = await GET(new Request("http://x"), {
      params: Promise.resolve({ id: job.id, artifact: "requirement" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns downloads from a gates_failed payload too", async () => {
    const job = createJob();
    publish(job.id, { type: "gates_failed", payload: samplePayload });
    const res = await GET(new Request("http://x"), {
      params: Promise.resolve({ id: job.id, artifact: "markdown" }),
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("# Title\nbody text");
  });
});
