import { nanoid } from "nanoid";
import type { JobEvent, JobState, EventListener } from "./types";

const jobs = new Map<string, JobState>();
const subs = new Map<string, Set<EventListener>>();

export function createJob(): JobState {
  const job: JobState = {
    id: `j_${nanoid(10)}`,
    status: "running",
    events: [],
    createdAt: Date.now(),
  };
  jobs.set(job.id, job);
  subs.set(job.id, new Set());
  return job;
}

export function getJob(id: string): JobState | undefined {
  return jobs.get(id);
}

export function publish(id: string, event: JobEvent): void {
  const job = jobs.get(id);
  if (!job) return;
  job.events.push(event);
  if (event.type === "finalized") {
    job.status = "finalized";
    job.result = event.payload;
  } else if (event.type === "gates_failed") {
    job.status = "gates_failed";
    job.result = event.payload;
  } else if (event.type === "diagrams_applied") {
    // 'apply' produces a new finalized payload (possibly with updated mermaid).
    job.status = "finalized";
    job.result = event.payload;
  } else if (event.type === "error") {
    job.status = "error";
    job.error = { code: event.code, message: event.message, retriable: event.retriable };
  }
  const listeners = subs.get(id);
  if (listeners) for (const fn of listeners) fn(event);
}

export function subscribe(id: string, listener: EventListener): () => void {
  const set = subs.get(id);
  if (!set) return () => {};
  set.add(listener);
  return () => set.delete(listener);
}

// Test-only helper. The Map state is module-level so tests must reset between cases.
export function _resetForTests(): void {
  jobs.clear();
  subs.clear();
}

export type { JobEvent, JobState, FinalizedPayload, RoleName, JobStatus } from "./types";
