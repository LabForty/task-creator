import { describe, it, expect, vi, beforeEach } from "vitest";
import { runFinalize } from "@/lib/finalize";
import { createJob, getJob, _resetForTests } from "@/lib/jobs";
import type { JobEvent } from "@/lib/jobs/types";
import type { Requirement, Story } from "@/lib/pipeline";

const sampleReq: Requirement = {
  title: "Export users as CSV",
  summary: "Operators can download the user table as a CSV.",
  problem: "Audit handoffs require slow manual SQL dumps today.",
  value: "Cuts audit handoff time and removes manual-export errors.",
  acceptanceCriteria: ["Returns 200 with a CSV body", "401 on invalid token"],
  outOfScope: [],
  dependencies: [],
  risks: [],
};

const sampleStory: Story = {
  title: "Export users as CSV",
  userStory: {
    asA: "platform operator",
    iWant: "download the user table as a CSV file",
    soThat: "hand it to auditors without writing SQL",
  },
  scope: ["GET /api/users/export", "Users page Export button"],
  requirements: [
    {
      category: "Endpoint",
      items: ["Add GET /api/users/export returning text/csv"],
    },
  ],
  acceptanceCriteria: ["Returns 200 with a CSV body", "Returns 401 on invalid token"],
  outOfScope: [],
};

beforeEach(() => _resetForTests());

function happyAgent() {
  return {
    runAnalyst: vi.fn(async ({ publish }: { publish: (e: JobEvent) => void }) => {
      publish({ type: "role_finished", role: "analyst", artifactId: sampleReq.title });
      return { requirement: sampleReq };
    }),
    runPlanner: vi.fn(async ({ publish }: { publish: (e: JobEvent) => void }) => {
      publish({ type: "role_finished", role: "planner", artifactId: sampleStory.title });
      return { story: sampleStory };
    }),
    makeTransport: vi.fn(() => ({ runRole: vi.fn(async () => {}) })),
  };
}

describe("runFinalize (orchestrator)", () => {
  it("happy path: analyst → schema gate → planner → schema gate → consistency → finalized event", async () => {
    const job = createJob();
    const agent = happyAgent();
    await runFinalize({ jobId: job.id, draft: { title: "T", description: "D" }, deps: { agent } });
    const final = getJob(job.id);
    expect(final?.status).toBe("finalized");
    expect(final?.result?.story.title).toBe(sampleStory.title);
    expect(final?.result?.markdown).toContain(`# ${sampleStory.title}`);
    expect(agent.runAnalyst).toHaveBeenCalledOnce();
    expect(agent.runPlanner).toHaveBeenCalledOnce();
  });

  it("schema failure from analyst retries once with a retryHint then succeeds", async () => {
    const job = createJob();
    const agent = happyAgent();
    const err = new Error("analyst: title is required") as Error & { gateErrors?: string[] };
    err.gateErrors = ["title: title is required"];
    agent.runAnalyst = vi
      .fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({ requirement: sampleReq });
    await runFinalize({ jobId: job.id, draft: { title: "T", description: "D" }, deps: { agent } });
    expect(agent.runAnalyst).toHaveBeenCalledTimes(2);
    const secondCall = (agent.runAnalyst.mock.calls[1][0] ?? {}) as { retryHint?: string[] };
    expect(secondCall.retryHint).toEqual(["title: title is required"]);
    expect(getJob(job.id)?.status).toBe("finalized");
  });

  it("consistency-gate failure puts the job in gates_failed but still emits a payload", async () => {
    const job = createJob();
    const agent = happyAgent();
    // Force a consistency failure by having the planner echo an out-of-scope item into an AC bullet.
    const reqWithOOS: Requirement = { ...sampleReq, outOfScope: ["scheduled exports happen automatically"] };
    const storyWithLeak: Story = {
      ...sampleStory,
      acceptanceCriteria: ["scheduled exports happen automatically every Monday"],
    };
    agent.runAnalyst = vi.fn(async () => ({ requirement: reqWithOOS }));
    agent.runPlanner = vi.fn(async () => ({ story: storyWithLeak }));
    await runFinalize({ jobId: job.id, draft: { title: "T", description: "D" }, deps: { agent } });
    expect(getJob(job.id)?.status).toBe("gates_failed");
    expect(getJob(job.id)?.result?.gates.consistency.ok).toBe(false);
  });

  it("transport error during analyst publishes an error JobEvent and the job goes to 'error'", async () => {
    const job = createJob();
    const agent = happyAgent();
    agent.runAnalyst = vi.fn(async ({ publish }: { publish: (e: JobEvent) => void }) => {
      publish({ type: "error", code: "E_AUTH", message: "401", retriable: false });
      throw new Error("E_AUTH: 401");
    });
    await runFinalize({ jobId: job.id, draft: { title: "T", description: "D" }, deps: { agent } });
    expect(getJob(job.id)?.status).toBe("error");
    expect(getJob(job.id)?.error?.code).toBe("E_AUTH");
  });
});
