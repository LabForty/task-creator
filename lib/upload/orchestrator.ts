import { subscribeToJob } from "@/lib/sse/client";
import type { JobEvent, FinalizedPayload } from "@/lib/jobs/types";
import type {
  BatchResult,
  DependencyLinkResolved,
  DependencyLinkSkipped,
  DependencyLinkSummary,
  RowState,
  UploadDestination,
  UploadTask,
} from "./types";

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

async function createEpicIfNeeded(dest: UploadDestination, signal?: AbortSignal): Promise<{ key: string; url: string } | null> {
  if (dest.epic.kind === "existing") return null;
  const res = await fetch("/api/jira/epic/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    signal,
    body: JSON.stringify({
      cloudId: dest.cloudId,
      projectKey: dest.projectKey,
      title: dest.epic.title,
      descriptionHtml: dest.epic.descriptionHtml,
      descriptionMarkdown: dest.epic.descriptionMarkdown,
    }),
  });
  const j = (await res.json().catch(() => ({}))) as { key?: string; url?: string; error?: string };
  if (!res.ok || !j.key || !j.url) {
    throw new Error(j.error || `epic create failed (${res.status})`);
  }
  return { key: j.key, url: j.url };
}

async function exportOne(
  payload: FinalizedPayload,
  task: UploadTask,
  dest: UploadDestination,
  resolvedEpicKey: string,
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
      diagrams: task.diagrams && Object.fromEntries(Object.entries(task.diagrams).filter(([, v]) => v && v.trim())),
      metadata: {
        labels: task.labels.length ? task.labels : undefined,
        epic: { kind: "existing" as const, key: resolvedEpicKey },
      },
    }),
  });
  const j = (await res.json().catch(() => ({}))) as { key?: string; url?: string; error?: string };
  if (!res.ok || !j.key || !j.url) throw new Error(j.error || `Jira export failed (${res.status})`);
  return { key: j.key, url: j.url };
}

type JiraLinkType = { id: string; name: string; inward: string; outward: string };
type IssueLinkRouteItem = { outwardIssueKey: string; inwardIssueKey: string };
type IssueLinkRouteResponse = {
  results?: {
    ok: IssueLinkRouteItem[];
    failed: Array<IssueLinkRouteItem & { error: string }>;
  };
  error?: string;
};

function collectDependencyEdges(
  tasks: UploadTask[],
  issueKeyByTaskId: Map<string, string>,
): { resolved: DependencyLinkResolved[]; skipped: DependencyLinkSkipped[] } {
  const resolved: DependencyLinkResolved[] = [];
  const skipped: DependencyLinkSkipped[] = [];
  const seenTaskEdges = new Set<string>();
  const seenIssueEdges = new Set<string>();

  for (const task of tasks) {
    for (const blockedId of task.blocks) {
      if (blockedId === task.id) continue;
      const taskEdgeKey = `${task.id}->${blockedId}`;
      if (seenTaskEdges.has(taskEdgeKey)) continue;
      seenTaskEdges.add(taskEdgeKey);

      const blockerKey = issueKeyByTaskId.get(task.id);
      const blockedKey = issueKeyByTaskId.get(blockedId);
      if (!blockerKey || !blockedKey) {
        skipped.push({ blockerId: task.id, blockedId, reason: "missing_issue_key" });
        continue;
      }

      const issueEdgeKey = `${blockerKey}->${blockedKey}`;
      if (seenIssueEdges.has(issueEdgeKey)) continue;
      seenIssueEdges.add(issueEdgeKey);
      resolved.push({ blockerId: task.id, blockedId, blockerKey, blockedKey });
    }
  }

  return { resolved, skipped };
}

async function loadBlocksLinkTypeId(cloudId: string, signal?: AbortSignal): Promise<string | null> {
  const res = await fetch(`/api/jira/link-types?cloudId=${encodeURIComponent(cloudId)}`, {
    credentials: "same-origin",
    signal,
  });
  const json = (await res.json().catch(() => ({}))) as { linkTypes?: JiraLinkType[]; error?: string };
  if (!res.ok) throw new Error(json.error || `link types failed (${res.status})`);
  const blocks = (json.linkTypes ?? []).find((t) => /^blocks$/i.test(t.name) || /^blocks$/i.test(t.outward));
  return blocks?.id ?? null;
}

async function createDependencyLinks(
  tasks: UploadTask[],
  cloudId: string,
  issueKeyByTaskId: Map<string, string>,
  signal?: AbortSignal,
): Promise<DependencyLinkSummary | undefined> {
  const { resolved, skipped } = collectDependencyEdges(tasks, issueKeyByTaskId);
  if (resolved.length === 0 && skipped.length === 0) return undefined;

  const summary: DependencyLinkSummary = { ok: [], skipped: [...skipped], failed: [] };
  if (resolved.length === 0) return summary;

  let linkTypeId: string | null;
  try {
    linkTypeId = await loadBlocksLinkTypeId(cloudId, signal);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    summary.warning = `Could not load Jira Blocks link type: ${reason}`;
    summary.skipped.push(
      ...resolved.map((l) => ({ blockerId: l.blockerId, blockedId: l.blockedId, reason: "link_type_load_failed" as const })),
    );
    return summary;
  }

  if (!linkTypeId) {
    summary.warning = "Jira Blocks link type was not available for this site.";
    summary.skipped.push(
      ...resolved.map((l) => ({ blockerId: l.blockerId, blockedId: l.blockedId, reason: "missing_blocks_link_type" as const })),
    );
    return summary;
  }

  const byIssueEdge = new Map(resolved.map((l) => [`${l.blockerKey}->${l.blockedKey}`, l]));
  let res: Response;
  let json: IssueLinkRouteResponse;
  try {
    res = await fetch("/api/jira/issue-links", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      signal,
      body: JSON.stringify({
        cloudId,
        links: resolved.map((l) => ({
          linkTypeId,
          outwardIssueKey: l.blockerKey,
          inwardIssueKey: l.blockedKey,
        })),
      }),
    });
    json = (await res.json().catch(() => ({}))) as IssueLinkRouteResponse;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    summary.failed.push(...resolved.map((l) => ({ ...l, error })));
    return summary;
  }
  if (!res.ok || !json.results) {
    const error = json.error || `dependency link failed (${res.status})`;
    summary.failed.push(...resolved.map((l) => ({ ...l, error })));
    return summary;
  }

  for (const ok of json.results.ok) {
    const edge = byIssueEdge.get(`${ok.outwardIssueKey}->${ok.inwardIssueKey}`);
    if (edge) summary.ok.push(edge);
  }
  for (const failed of json.results.failed) {
    const edge = byIssueEdge.get(`${failed.outwardIssueKey}->${failed.inwardIssueKey}`);
    if (edge) summary.failed.push({ ...edge, error: failed.error });
  }
  return summary;
}

export async function runBatchUpload(args: Args): Promise<BatchResult> {
  const uploaded: string[] = [];
  const issueKeyByTaskId = new Map<string, string>();
  for (const task of args.tasks) {
    if (task.uploadedIssueKey) issueKeyByTaskId.set(task.id, task.uploadedIssueKey);
  }
  const linkCurrentDependencies = () =>
    createDependencyLinks(
      args.tasks,
      args.destination.cloudId,
      issueKeyByTaskId,
      args.signal,
    );

  // Step 1: resolve the epic key — either the user-picked existing one or
  // a freshly-created Epic in Jira. Failure here aborts before any sub-task
  // is touched, so we never leave orphan sub-tasks pointing at nothing.
  let resolvedEpicKey: string;
  try {
    if (args.destination.epic.kind === "existing") {
      resolvedEpicKey = args.destination.epic.key;
    } else {
      const created = await createEpicIfNeeded(args.destination, args.signal);
      if (!created) throw new Error("epic creation returned no key");
      resolvedEpicKey = created.key;
    }
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    // Surface as a synthetic failure on the first task so the sheet can show
    // a results view; if there is no first task, just return.
    if (args.tasks.length > 0) {
      args.onRow(args.tasks[0].id, { kind: "failed", reason: `epic create: ${reason}` });
      return { uploaded, failedId: args.tasks[0].id, failedReason: `epic create: ${reason}` };
    }
    return { uploaded, failedId: undefined, failedReason: `epic create: ${reason}` };
  }

  for (const task of args.tasks) {
    if (args.signal?.aborted) {
      args.onRow(task.id, { kind: "failed", reason: "cancelled" });
      return { uploaded, failedId: task.id, failedReason: "cancelled" };
    }
    if (task.uploadedIssueKey) {
      args.onRow(task.id, {
        kind: "already_uploaded",
        issueKey: task.uploadedIssueKey,
        issueUrl: task.uploadedIssueUrl,
      });
      continue;
    }
    try {
      args.onRow(task.id, { kind: "finalizing" });
      const payload = task.finalizedPayload ?? await finalizeOne(task, args.signal);

      if (args.signal?.aborted) {
        args.onRow(task.id, { kind: "failed", reason: "cancelled" });
        return { uploaded, failedId: task.id, failedReason: "cancelled" };
      }

      args.onRow(task.id, { kind: "uploading" });
      const { key, url } = await exportOne(payload, task, args.destination, resolvedEpicKey, args.signal);
      issueKeyByTaskId.set(task.id, key);
      args.onRow(task.id, { kind: "uploaded", issueKey: key, issueUrl: url });
      uploaded.push(task.id);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      args.onRow(task.id, { kind: "failed", reason });
      const dependencyLinks = args.signal?.aborted ? undefined : await linkCurrentDependencies();
      return { uploaded, failedId: task.id, failedReason: reason, dependencyLinks };
    }
  }

  const dependencyLinks = await linkCurrentDependencies();
  return { uploaded, dependencyLinks };
}
