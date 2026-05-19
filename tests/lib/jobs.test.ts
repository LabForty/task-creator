import { describe, it, expect, vi, beforeEach } from "vitest";
import { createJob, getJob, publish, subscribe, _resetForTests } from "@/lib/jobs";
import type { FinalizedPayload } from "@/lib/jobs/types";

const emptyPayload: FinalizedPayload = {
  requirement: { title: "stub req" } as never,
  story: { title: "stub story" } as never,
  gates: {
    schema: { gate: "schema", ok: true },
    consistency: { gate: "consistency", ok: true },
  },
  markdown: "x",
  downloadUrls: { requirement: "/r", story: "/s", markdown: "/m" },
};

beforeEach(() => _resetForTests());

describe("lib/jobs", () => {
  it("createJob returns a unique id starting with 'j_' and status='running'", () => {
    const a = createJob();
    const b = createJob();
    expect(a.id).not.toEqual(b.id);
    expect(a.id.startsWith("j_")).toBe(true);
    expect(getJob(a.id)?.status).toBe("running");
  });

  it("publish appends events to the job and notifies subscribers", () => {
    const job = createJob();
    const listener = vi.fn();
    const unsub = subscribe(job.id, listener);
    publish(job.id, { type: "role_started", role: "analyst" });
    expect(getJob(job.id)?.events).toHaveLength(1);
    expect(listener).toHaveBeenCalledWith({ type: "role_started", role: "analyst" });
    unsub();
  });

  it("publishing a finalized event sets status='finalized' and result", () => {
    const job = createJob();
    publish(job.id, { type: "finalized", payload: emptyPayload });
    expect(getJob(job.id)?.status).toBe("finalized");
    expect(getJob(job.id)?.result?.markdown).toBe("x");
  });

  it("publishing a gates_failed event sets status='gates_failed' and retains the partial payload", () => {
    const job = createJob();
    const partial: FinalizedPayload = { ...emptyPayload, gates: { schema: { gate: "schema", ok: true }, consistency: { gate: "consistency", ok: false, errors: ["bad"] } } };
    publish(job.id, { type: "gates_failed", payload: partial });
    expect(getJob(job.id)?.status).toBe("gates_failed");
    expect(getJob(job.id)?.result?.gates.consistency.ok).toBe(false);
  });

  it("publishing an error event sets status='error' and error", () => {
    const job = createJob();
    publish(job.id, { type: "error", code: "E_TIMEOUT", message: "boom", retriable: true });
    expect(getJob(job.id)?.status).toBe("error");
    expect(getJob(job.id)?.error?.code).toBe("E_TIMEOUT");
    expect(getJob(job.id)?.error?.retriable).toBe(true);
  });

  it("unsubscribe stops further notifications", () => {
    const job = createJob();
    const listener = vi.fn();
    const unsub = subscribe(job.id, listener);
    unsub();
    publish(job.id, { type: "role_progress", role: "analyst", message: "x" });
    expect(listener).not.toHaveBeenCalled();
  });

  it("publish on an unknown job is a silent no-op (no throw)", () => {
    expect(() => publish("j_does-not-exist", { type: "role_started", role: "analyst" })).not.toThrow();
  });

  it("getJob returns undefined for an unknown id", () => {
    expect(getJob("j_does-not-exist")).toBeUndefined();
  });

  it("multiple subscribers all receive events", () => {
    const job = createJob();
    const a = vi.fn();
    const b = vi.fn();
    subscribe(job.id, a);
    subscribe(job.id, b);
    publish(job.id, { type: "role_progress", role: "planner", message: "hi" });
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });
});
