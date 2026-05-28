import { subscribeToJob } from "@/lib/sse/client";
import type { JobEvent, FinalizedPayload } from "@/lib/jobs/types";
import type { BatchResult, RowState, UploadDestination, UploadTask } from "./types";

type Args = {
  tasks: UploadTask[];
  destination: UploadDestination;
  signal?: AbortSignal;
  onRow: (id: string, state: RowState) => void;
};

async function finalizeOne(task: UploadTask, signal?: AbortSignal): Promise<FinalizedPayload> {
  const res = await fetch("/api/finalize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ draft: task.draft }),
    signal,
  });
  const json = (await res.json().catch(() => ({}))) as { jobId?: string; error?: string };
  if (!res.ok || !json.jobId) {
    throw new Error(json.error || `finalize failed (${res.status})`);
  }
  // Bridge the SSE stream into a promise that resolves on `finalized` or
  // rejects on `gates_failed` / `error`. The orchestrator only needs the
  // final payload; intermediate role_* / gate_* events are ignored.
  return new Promise<FinalizedPayload>((resolve, reject) => {
    const unsub = subscribeToJob(json.jobId!, (e: JobEvent) => {
      if (e.type === "finalized") {
        unsub();
        resolve(e.payload);
      } else if (e.type === "gates_failed") {
        unsub();
        reject(new Error("schema gates failed for this task"));
      } else if (e.type === "error") {
        unsub();
        reject(new Error(e.message));
      }
    });
  });
}

async function exportOne(
  payload: FinalizedPayload,
  task: UploadTask,
  dest: UploadDestination,
  signal?: AbortSignal,
): Promise<{ key: string; url: string }> {
  const res = await fetch("/api/jira/export", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    signal,
    body: JSON.stringify({
      cloudId: dest.cloudId,
      projectKey: dest.projectKey,
      issueTypeId: dest.issueTypeId,
      payload: { story: payload.story, markdown: payload.markdown, constraints: undefined },
      metadata: {
        labels: task.labels.length ? task.labels : undefined,
        epic: dest.parentEpicKey ? { kind: "existing" as const, key: dest.parentEpicKey } : undefined,
      },
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { key?: string; url?: string; error?: string };
  if (!res.ok || !json.key || !json.url) {
    throw new Error(json.error || `Jira export failed (${res.status})`);
  }
  return { key: json.key, url: json.url };
}

export async function runBatchUpload(args: Args): Promise<BatchResult> {
  const uploaded: string[] = [];
  for (const task of args.tasks) {
    if (args.signal?.aborted) {
      args.onRow(task.id, { kind: "failed", reason: "cancelled" });
      return { uploaded, failedId: task.id, failedReason: "cancelled" };
    }
    try {
      args.onRow(task.id, { kind: "finalizing" });
      const payload = await finalizeOne(task, args.signal);

      if (args.signal?.aborted) {
        args.onRow(task.id, { kind: "failed", reason: "cancelled" });
        return { uploaded, failedId: task.id, failedReason: "cancelled" };
      }

      args.onRow(task.id, { kind: "uploading" });
      const { key, url } = await exportOne(payload, task, args.destination, args.signal);
      args.onRow(task.id, { kind: "uploaded", issueKey: key, issueUrl: url });
      uploaded.push(task.id);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      args.onRow(task.id, { kind: "failed", reason });
      return { uploaded, failedId: task.id, failedReason: reason };
    }
  }
  return { uploaded };
}
