import { subscribeToJob } from "@/lib/sse/client";
import type { JobEvent, FinalizedPayload } from "@/lib/jobs/types";
import type { Draft } from "@/lib/draft/autosave";

export type BakeTask = { id: string; draft: Draft };

export type BakeState = "pending" | "baking" | "baked" | "failed";

export type BakeResult = {
  finalized: Record<string, FinalizedPayload>;
  failedId?: string;
  failedReason?: string;
};

type Args = {
  tasks: BakeTask[];
  finalizedExisting?: Record<string, FinalizedPayload>;
  signal?: AbortSignal;
  onProgress: (id: string, state: BakeState, error?: string) => void;
};

async function finalizeOne(draft: Draft, signal?: AbortSignal): Promise<FinalizedPayload> {
  const res = await fetch("/api/finalize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ draft }),
    signal,
  });
  const j = (await res.json().catch(() => ({}))) as { jobId?: string; error?: string };
  if (!res.ok || !j.jobId) throw new Error(j.error || `finalize failed (${res.status})`);
  return new Promise<FinalizedPayload>((resolve, reject) => {
    const unsub = subscribeToJob(j.jobId!, (e: JobEvent) => {
      if (e.type === "finalized") { unsub(); resolve(e.payload); }
      else if (e.type === "gates_failed") { unsub(); reject(new Error("schema gates failed for this task")); }
      else if (e.type === "error") { unsub(); reject(new Error(e.message)); }
    });
  });
}

export async function runBakeAll(args: Args): Promise<BakeResult> {
  const finalized: Record<string, FinalizedPayload> = { ...(args.finalizedExisting ?? {}) };
  for (const t of args.tasks) {
    if (finalized[t.id]) continue; // already done in a prior run
    if (args.signal?.aborted) {
      args.onProgress(t.id, "failed", "cancelled");
      return { finalized, failedId: t.id, failedReason: "cancelled" };
    }
    try {
      args.onProgress(t.id, "baking");
      const payload = await finalizeOne(t.draft, args.signal);
      finalized[t.id] = payload;
      args.onProgress(t.id, "baked");
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      args.onProgress(t.id, "failed", reason);
      return { finalized, failedId: t.id, failedReason: reason };
    }
  }
  return { finalized };
}
