# Epic Mode — Phase 4 (SP4): Finalize gating, task graph, batch Jira upload

**Ticket:** AI-36 (Add Epic Mode To Task Creator) — tasks 7 and 8.
**Date:** 2026-05-28
**Status:** Approved design, ready for implementation plan
**Builds on:** SP1 (kneading), SP2 (sub-task list), SP3 (reviewer mode + interference), the tabbed-editor refactor, and the analyze-walk/forced-kneading/clear+back follow-up.

## Description

Replace the two placeholders left at the bottom of the reviewer's left sidebar — the disabled `Finalize` button and the "Diagram from tasks arrives in a later phase." text — with the missing Phase 4 surface:

1. **Finalize gate** — the button is enabled only when every task is marked `approved` or `denied` (no `change_requested` left unresolved, no `pending`).
2. **Task graph** — a live mermaid diagram in the Diagrams slot showing one node per task, colored by review status, with edges from each task's `blocks` list. No "build" button — it renders from the same state the reviewer is editing.
3. **Per-task pipeline + batch upload** — clicking Finalize opens an upload sheet. The sheet collects the Jira destination once (site / project / issue type / optional parent epic), then runs the existing single-task finalize + Jira export pipeline once per non-Denied task, sequentially. On failure the run stops, no rollback. A results summary lists created issue keys, the failure (if any), and the excluded Denied tasks.
4. **Persistence of upload status** — each task's created Jira issue key is stored on its descriptor so a reload preserves the result; a subsequent Finalize re-attempts only tasks without an issue key (lets the user resume after a partial-failure).

Drafts (save / load epic state across sessions) are explicitly **out of scope** for SP4 and will be a later phase.

## Decisions (from brainstorming)

1. **Per-task pipeline = the existing finalize + export pipeline, sequential.** For each non-Denied task we call `POST /api/finalize` (drives analyst → planner with the per-task `taskType`) and then `POST /api/jira/export` (the same endpoint the single-task flow uses). No new API endpoints — all orchestration lives on the client.
2. **Diagram is live + status-colored.** Mermaid `graph TD`, node fill from review status, no manual "Generate" button.
3. **Drafts deferred.** Finalize has one outcome: open the upload sheet. No save-as-draft chooser modal.
4. **Post-success: results summary inside the sheet.** Reviewer view stays mounted underneath; user can close the sheet and re-edit + re-finalize. Tasks that already uploaded carry their issue key and aren't re-uploaded.

## Architecture

### Pure logic

`lib/review/state.ts` (extend):

```ts
export function allReviewedFinal(reviews: ReviewMap, taskIds: string[]): boolean {
  return taskIds.length > 0 && taskIds.every((id) => {
    const r = reviews[id];
    return r && (r.status === "approved" || r.status === "denied");
  });
}

export function nonDeniedTaskIds(reviews: ReviewMap, taskIds: string[]): string[] {
  return taskIds.filter((id) => reviews[id]?.status !== "denied");
}
```

`lib/epic/taskGraph.ts` (new) — pure mermaid builder:

```ts
export type TaskGraphInput = {
  tasks: EpicTask[];                            // titles, blocks, blockedBy
  reviews: ReviewMap;                            // status per id
  assignees?: Record<string, string | undefined>; // optional assignee labels keyed by task id
};

export function buildTaskGraphMermaid(input: TaskGraphInput): string;
```

Output shape:

```
graph TD
  classDef approved        fill:#dcfce7,stroke:#16a34a,color:#065f46;
  classDef denied          fill:#fee2e2,stroke:#dc2626,color:#7f1d1d;
  classDef change_requested fill:#fef9c3,stroke:#ca8a04,color:#713f12;
  classDef pending         fill:#f1f5f9,stroke:#64748b,color:#0f172a;
  t_<id1>["Title<br/>(Alice)"]:::approved
  t_<id2>["Title 2"]:::pending
  t_<id1> --> t_<id2>
```

Node IDs are nanoid-derived → mermaid-safe with a `t_` prefix to guarantee a leading letter. Titles are HTML-escaped; long titles truncated to 40 chars with an ellipsis. Empty task list → empty string (renderer skips). Pure module — no imports from `react`/`mermaid`/the SDK.

### Components

**`components/epic/review/TaskGraph.tsx`** (new) — pure presentational. Props: `{ tasks, reviews, assignees? }`. Renders nothing when `tasks.length === 0`. Otherwise calls `buildTaskGraphMermaid` and pipes the result into the existing project mermaid renderer (re-uses whatever component renders the per-format mermaid in the `Preview` flow today). One small visual frame around the diagram + a section header `Task graph`.

**`components/epic/review/UploadSheet.tsx`** (new) — right-side slide-in sheet, modelled after the existing `JiraExport.tsx` but driving a batch.

Sheet has three phases internally (`phase: "destination" | "running" | "results"`):

- `destination` — site / project / issue type pickers (reused from JiraExport, factored where reasonable), plus an optional "Parent epic key" text field. A `Start upload` button transitions to `running`. `Cancel` closes the sheet.
- `running` — list of non-Denied tasks with per-row status chips (see orchestrator below) and a `Cancel` button. Reviewer view dim/disabled in the background. Each completed row links to its created Jira issue.
- `results` — summary view:
  - **Uploaded** — created issue keys with links.
  - **Failed** — the one task that stopped the run (if any), with its error message and a `Retry from here` button (re-runs from that task).
  - **Excluded** — Denied tasks that were never attempted.
  - `Done` → closes the sheet.

**`ReviewerMode.tsx`** changes (modify): drop the "Diagram from tasks arrives in a later phase." placeholder and mount `<TaskGraph tasks reviews assignees />`. The `Finalize` button gains a derived `disabled={!allReviewedFinal(reviews, tasks.map(t=>t.id))}` and the same when-disabled `title` hint; when enabled, `onClick` calls a new `onFinalize` prop the parent passes (which opens the UploadSheet in StandaloneApp).

### Orchestrator

**`lib/upload/orchestrator.ts`** (new) — pure async sequencer with row-state callbacks.

```ts
export type RowState =
  | { kind: "pending" }
  | { kind: "finalizing" }
  | { kind: "uploading" }
  | { kind: "uploaded"; issueKey: string; issueUrl: string }
  | { kind: "failed"; reason: string };

export type RowsState = Record<string, RowState>; // keyed by task id

export type UploadTask = {
  id: string;
  draft: Draft;                  // the per-task draft from localStorage
  assignee?: string;             // free-text label
  labels: string[];              // from the descriptor
};

export type UploadDestination = {
  cloudId: string;
  projectKey: string;
  issueTypeId: string;
  parentEpicKey?: string;
};

export async function runBatchUpload(args: {
  tasks: UploadTask[];                 // non-Denied subset, already filtered
  destination: UploadDestination;
  signal?: AbortSignal;
  onRow: (id: string, state: RowState) => void;
}): Promise<{ uploaded: string[]; failedId?: string; failedReason?: string }>;
```

Behaviour:
1. For each task in order:
   - `onRow(id, { kind: "finalizing" })` → `POST /api/finalize` with `{ draft }`. Subscribe to the SSE job; wait for `finalized` event → returns `FinalizedPayload`.
   - `onRow(id, { kind: "uploading" })` → `POST /api/jira/export` with `{ payload, destination, assignee, labels }`. Wait for the response → returns `{ key, url }`.
   - `onRow(id, { kind: "uploaded", issueKey, issueUrl })`.
2. On any throw (network, agent error, gate failure, Jira 4xx/5xx): `onRow(id, { kind: "failed", reason })`, stop the loop, return `{ uploaded, failedId, failedReason }`.
3. `signal.aborted` between rows → fail the current row with reason `"cancelled"` and return.

No retries. No parallelism. Done already-uploaded tasks are remembered by the caller (StandaloneApp) so a re-run skips them.

### Wiring (StandaloneApp.tsx)

- New state: `uploadOpen: boolean`. Show the sheet when true.
- New state: `uploadedKeys: Record<string, { key: string; url: string }>` (keyed by task id). Hydrate from each task descriptor's `uploadedIssueKey`/`uploadedIssueUrl` on mount. Persist via the existing `persistEpicTasks` path (descriptors gain `uploadedIssueKey?` and `uploadedIssueUrl?`).
- `onFinalize` handler → derive the run's task subset (non-Denied AND not already uploaded), open the sheet.
- The sheet runs the orchestrator. Each `onRow` row-state change updates a transient sheet-local map (the persistent record only flips on `uploaded`). On `uploaded`, also call `setEpicTasks(prev => prev.map(t => t.id === id ? { ...t, uploadedIssueKey, uploadedIssueUrl } : t))` and `persistEpicTasks`.
- `ReviewNav` (existing) gets a small `AI-NNN` chip next to a task's title when `descriptor.uploadedIssueKey` is set.

### Files added/touched

**New:**
- `lib/epic/taskGraph.ts`
- `lib/upload/orchestrator.ts`
- `lib/upload/types.ts` (the `RowState`, `UploadTask`, `UploadDestination` types — keeps `orchestrator.ts` itself focused on the sequencer)
- `components/epic/review/TaskGraph.tsx`
- `components/epic/review/UploadSheet.tsx`
- `tests/lib/taskGraph.test.ts`
- `tests/lib/upload-orchestrator.test.ts`
- `tests/components/epic/review/TaskGraph.test.tsx`
- `tests/components/epic/review/UploadSheet.test.tsx`

**Modified:**
- `lib/review/state.ts` — add `allReviewedFinal` + `nonDeniedTaskIds`.
- `lib/epic/tasks.ts` — extend `EpicTask` with optional `uploadedIssueKey?: string` and `uploadedIssueUrl?: string`; preserve them through `deleteEpicTask` / `setTitle` / etc. (they're already immutable copies, so just adding the fields is enough).
- `lib/draft/autosave.ts` — `loadDraft` already preserves arbitrary `epicTasks` entries; the new optional fields ride through unchanged.
- `components/epic/review/ReviewerMode.tsx` — mount `TaskGraph`, wire `allReviewedFinal` to the Finalize button, add `onFinalize` prop.
- `components/epic/review/ReviewNav.tsx` — show `AI-NNN` chip when `descriptor.uploadedIssueKey` is set.
- `components/StandaloneApp.tsx` — `uploadOpen` state, the `onFinalize` handler, mount the `UploadSheet`.

## Acceptance criteria

### Finalize gate
- `allReviewedFinal({}, [])` is `false`; `allReviewedFinal({ a: { status: "approved", … } }, ["a"])` is `true`; with a `change_requested` or `pending` task in the list the result is `false`.
- The Reviewer's `Finalize` button reflects this derived state: disabled when not all final, with the existing tooltip; enabled otherwise.
- Clicking the enabled button opens the upload sheet.

### Task graph
- `buildTaskGraphMermaid` on an empty `tasks` array returns `""` (renderer treats as no diagram).
- A two-task graph where task A `blocks` task B emits one edge `t_A --> t_B`.
- Each node gets the correct `:::approved|denied|change_requested|pending` class based on `reviews[id].status` (default `pending`).
- An assignee, when present, renders as a second line in the node label.
- `TaskGraph` component renders the mermaid via the project's existing mermaid renderer; the diagram updates live when any of `tasks`/`reviews`/`assignees` change (no "build" button).

### Per-task pipeline + batch
- The orchestrator processes tasks in input order, sequentially, with no parallelism.
- For each task: `onRow(id, finalizing)` → finalize succeeds → `onRow(id, uploading)` → export succeeds → `onRow(id, uploaded, issueKey, issueUrl)`.
- On any error: the failing row becomes `failed` with the error message; the orchestrator stops and returns `{ uploaded, failedId, failedReason }`. No remaining tasks are touched.
- `signal.aborted` between rows fails the current row with reason `"cancelled"`.
- Denied tasks are filtered out before the orchestrator sees them (filtering done by the caller).
- An already-uploaded task (with `descriptor.uploadedIssueKey` set) is excluded from a subsequent run; the caller filters it out.

### Upload sheet
- The sheet mounts when the user clicks an enabled Finalize.
- `destination` phase shows site/project/issue-type pickers + an optional parent epic key field. `Start upload` is disabled until project + issue type are picked.
- `running` phase shows the list of non-Denied non-already-uploaded tasks with per-row status. `Cancel` aborts.
- `results` phase shows uploaded keys (with links), failed task (with retry-from-here), and excluded Denied tasks.
- Already-uploaded tasks persist their `AI-NNN` chip in ReviewNav across reload.

### Tests
- Unit: `allReviewedFinal`, `nonDeniedTaskIds`, `buildTaskGraphMermaid` (empty, single node, two with edge, all four statuses, assignee rendering, title escaping/truncation), `runBatchUpload` (happy path, fail-stop on the second of three, abort between rows, empty-input no-op).
- Component: `TaskGraph` (renders mermaid markup for known fixtures; renders nothing on empty input). `UploadSheet` (destination → running → results phase transitions driven by orchestrator callbacks; cancel works; retry-from-here re-invokes the orchestrator with the failed task subset).
- Integration: StandaloneApp — Finalize button gates correctly, opens sheet, persists `uploadedIssueKey` through the descriptor on a fake-success orchestrator, ReviewNav chip shows.
- e2e skipped per project decision.

## Out of scope (later)
- Save-as-draft / drafts list / per-ticket checkbox selection from drafts (deferred per user decision).
- Real Jira user-search for assignees (today's free-text label is what the export route already accepts; mapping is the existing pipeline's concern).
- Per-task diagrams baked into each Jira ticket body (would multiply tokens; sub-tasks should be small enough that textual tickets suffice).
- Chunked progress for very large epics (the existing `MAX_SUBTASKS = 50` cap bounds the queue).

## Edge cases
- Zero tasks → Finalize stays disabled (`allReviewedFinal` returns false on empty input).
- All tasks Denied → Finalize is enabled (all reviewed) but the orchestrator's input set is empty; the sheet skips `running` and goes straight to `results` with just the Excluded list.
- A single failure on task K leaves tasks 1..K-1 uploaded; their `uploadedIssueKey` is persisted; reopening Finalize attempts only K..N (the failed task plus any after it).
- Re-finalize with everything already uploaded → orchestrator input is empty, the sheet shows a results-only view with all keys.
- Mermaid label with characters that would break the syntax (`"`, `[`, `]`, newlines) — `buildTaskGraphMermaid` escapes via the same pattern other diagram builders in the project use (HTML-encode + replace bracket chars).
- A task whose description is empty after a Clear: finalize still runs (the underlying pipeline is responsible for surfacing "not enough context" if the draft is unusable; the orchestrator surfaces that as a failure with the pipeline's own message).
