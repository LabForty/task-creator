# Epic Mode — Post-knead UX overhaul (cards + per-task Bake)

**Ticket:** AI-36 follow-up to SP4.
**Date:** 2026-05-28
**Status:** Approved design, ready for implementation plan.
**Supersedes:** the editing surface from the tabbed-editor refactor, all of reviewer-mode (SP3), and the SP4 task-graph's reviewer placement. Reuses the single-task `Preview` + `JiraExport` + finalize pipeline. Keeps the SP4 batch upload orchestrator with one signature extension.

## Description

The current epic-mode flow after sub-tasks are generated has two problems the user wants fixed:

1. **Editing surface**: the top tab strip wastes vertical space and isn't a great affordance for a multi-task workspace. Switching tabs feels heavy.
2. **Bake / reviewer mode**: the reviewer's lightweight per-task status + comment + interference UI is not what the user actually wants. The natural expectation after kneading is "give me the same Finalize + Preview + Diagrams experience the single-task flow has, but for every sub-task at once."

This spec replaces both surfaces:

- **Editing phase**: 3-column layout — editor on the left/center, a card grid of sub-tasks (plus the epic) on the right, the analyze HelpPanel as a third column on the far right when active.
- **Bake action**: clicking Bake eagerly runs the existing `/api/finalize` pipeline (analyst → planner → markdown) for every sub-task in sequence, with inline progress on the cards.
- **Bake view**: replaces reviewer mode. Left menu listing the epic + every task; main pane shows the per-task `Preview` surface — finalized markdown + create/edit/analyze diagrams + Ask-anything Help, all keyed per task. Bottom of the menu has **Upload all to Jira** (batch ship) and **← Back to editing**.
- **Cleanup**: per-task review controls (status / assignee / comment / change-requested / interference) are removed entirely.

## Decisions (from brainstorming)

1. **No reviewer controls.** Per-task statuses, assignee, change-requested-with-comment, and interference analysis are removed. Every task ships unless the user deletes it. The per-task Bake view exposes the full single-task surface (markdown + diagrams + Help).
2. **Eager Finalize on Bake.** Clicking Bake runs the finalize pipeline for every task sequentially, with stop-on-error semantics. Already-finalized payloads stay cached across retries.
3. **Editing phase = three columns.** Editor (flex-1) · Cards (~280px) · HelpPanel (~360px, only when analyzing).
4. **Per-task diagrams = full single-task parity.** Each task in Bake view can create / edit / regenerate / analyze all three mermaid formats (flow / sequence / interaction). Diagrams persist per task id.
5. **Card actions on the cards themselves.** Each card has its own × delete (with inline confirm). A `+ Add task` tile at the end of the list. The current "Delete task" button at the top of `EpicTaskEditor` goes away.
6. **Task graph = Epic overview in Bake.** First entry of the Bake left menu shows the existing `TaskGraph` (with the SP4 tighter palette). The graph is not visible during the editing phase.
7. **Batch ship only.** No per-task `Export to Jira` button in the Bake view. The bottom of the left menu has one **Upload all to Jira** action that runs the existing `UploadSheet`, but the orchestrator now skips the per-task finalize call (uses the cached `FinalizedPayload` from the bake step).
8. **Labels + blocks/blocked-by stay in the editor pane** (in the existing `Dependencies & labels` card below the Editor) — not on the cards.
9. **Bake progress = inline at the top of the cards.** Sticky progress strip + per-card status flips (`pending` → `baking` → `baked`/`failed`). Editor goes read-only during the run.

## Architecture

### State changes in `components/StandaloneApp.tsx`

**Removed:**
- `reviewing`, `reviews`, `interference`, `selectedReviewId`, `interferenceTimer` (and the unmount-cleanup effect).
- `bake()` (the old reviewer transition), `exitReview()`, `changeReview()`, `scheduleInterference()`.
- `reviewTitleChange`, `reviewSetLabels`, `reviewAddLink`, `reviewRemoveLink`, `reviewDelete`, `persistReview`.
- All `selectedReviewId` plumbing into `ReviewerMode`.

**Added:**
```ts
const [bakeStatus, setBakeStatus] = useState<"idle" | "baking" | "baked">("idle");
const [bakeProgress, setBakeProgress] = useState<Record<string, "pending" | "baking" | "baked" | "failed">>({});
const [bakeError, setBakeError] = useState<{ taskId: string; reason: string } | null>(null);
const [finalizedById, setFinalizedById] = useState<Record<string, FinalizedPayload>>({});
const [diagramsById, setDiagramsById] = useState<Record<string, Diagrams>>({});
const [bakeSelectedId, setBakeSelectedId] = useState<"epic" | string>("epic");
const bakeAbortRef = useRef<AbortController | null>(null);
```

**Persistence:** `bakeStatus`, `bakeProgress`, `finalizedById`, `diagramsById` are *session-only* — they live in React state, not the standalone draft. Re-baking on next session is cheaper than persisting `FinalizedPayload`s in localStorage (they include analyst Requirement + planner Story + markdown, can be ~20–40 KB per task, would balloon the standalone draft past sensible limits).

**Render gate:** the existing `epicMode && reviewing ? <ReviewerMode /> : ...` branch becomes:
```ts
epicMode && bakeStatus === "baked"
  ? <BakeView ... />
  : epicMode && epicTasks.length > 0
  ? <EpicEditingView ... />
  : <Editor ... />
```

### Phase 1 — `EpicEditingView`

**File:** `components/epic/EpicEditingView.tsx` (replaces `components/epic/EpicTabs.tsx`).

**Layout** (top-level flex column):
1. **Toolbar** — `← Back to kneading` (existing `BackBar` with confirm) · spacer · **Analyze all** · **Bake**. Bake is disabled when `bakeStatus === "baking"`.
2. **Body** (flex row, fills remaining height):
   - **Left/center** (`flex-1 min-w-0 overflow-y-auto`): renders the active card's editor. If active id is `"epic"`, render `<Editor namespace={NAMESPACE} hideSubmit onClear={...} taskTypeLocked="epic" />`. If active id is a sub-task id, render `<EpicTaskEditor ... />` (now without its top header strip).
   - **Cards column** (`w-[280px] shrink-0 border-l border-rule overflow-y-auto`): renders `<EpicTaskCards />`.
   - **HelpPanel column** (only when `analyzeTaskId` is set): the existing `<HelpPanel />` rendered on the far right via flex sibling, NOT as a `fixed`-positioned floating sheet. This means the existing `HelpPanel`'s `aside className="sticky top-0 self-start ..."` needs to drop the `fixed`/`sticky` positioning when used in this context — or, simpler, the `EpicEditingView` wraps it in a `flex-shrink-0 w-[400px]` container and the HelpPanel's existing height/scroll behavior is preserved. **Implementation choice:** keep `HelpPanel` unchanged (its outer `<aside>` already has its own internal layout); render it as the third flex child without altering its styles. The fixed-width sibling sizing wins.
3. **During bake**: the toolbar's Bake button is replaced by a Cancel button; the editor area is wrapped in a `pointer-events-none opacity-60` div; the cards column shows the progress strip at top.

### `EpicTaskCards` (right column)

**File:** `components/epic/EpicTaskCards.tsx`.

Props:
```ts
{
  epicTitle: string;                       // from liveDraft.title for the Epic card
  epicDescriptionPreview: string;          // first ~80 chars from liveDraft.description (HTML stripped)
  tasks: EpicTask[];
  activeId: "epic" | string;
  bakeProgress?: Record<string, "pending" | "baking" | "baked" | "failed">;
  bakeStatus: "idle" | "baking" | "baked";
  bakeTotal?: number;                      // count of tasks being baked
  bakeDone?: number;                       // count already baked
  onSelect: (id: "epic" | string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;          // (×) button on each card
  onCancelBake: () => void;
}
```

Renders (top to bottom):
1. **Progress strip** (only when `bakeStatus === "baking"`): `"Baking N/M…"` + `Cancel` button.
2. **Epic card** (pinned, can't be deleted): `<EpicTaskCard kind="epic" .../>`.
3. **Task cards** (one per `tasks` entry): `<EpicTaskCard kind="task" .../>`.
4. **`+ Add task` tile** at the end (button styled as a dashed-border card; only enabled when `bakeStatus !== "baking"`).

### `EpicTaskCard` (single card)

**File:** `components/epic/EpicTaskCard.tsx`.

Props:
```ts
{
  kind: "epic" | "task";
  title: string;
  descriptionPreview: string;       // ~80 chars, stripped
  labelsCount?: number;             // tasks only
  linksCount?: number;              // tasks only; sum of blocks+blockedBy
  active: boolean;
  bakeState?: "pending" | "baking" | "baked" | "failed";
  bakeError?: string;
  onSelect: () => void;
  onDelete?: () => void;            // omitted for Epic
}
```

Renders a clickable card with rounded border, hover styles, active highlight (`border-accent`). Description preview truncated with ellipsis. Bottom row: small counts (when `kind === "task"`). Bake state indicator chip (only when `bakeState` is set): ⏱ pending / ⏳ baking / ✓ baked / ⨯ failed (with `bakeError` as `title=`).

Delete button: `×` in top-right corner, hidden by default, visible on hover or focus. Click → inline confirm (`Delete?` `Yes` `No`) before firing `onDelete`. Epic card has no delete.

### `EpicTaskEditor` simplification

**File:** `components/epic/EpicTaskEditor.tsx` (modify).

Remove the top header strip (the `<Button>Analyze this task</Button>` + `<Button aria-label="Delete task">Delete task</Button>` row). The `onAnalyze` and `onDelete` props become unused — drop them from the type. The cards drive delete + analyze now.

The component body keeps: the `<Editor>` (with `key={taskId:refreshKey}`, `namespace={epicTaskNamespace(taskId)}`, `hideSubmit`, `onClear={onClear}`, `onDraftChange={d => onTitleChange(d.title)}`) and the `Dependencies & labels` card with `LabelsEditor` + `SubtaskLinksField`.

### Phase 2 — Eager Bake

**Pure logic:** `lib/epic/bake.ts`.

```ts
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
  // Skip tasks already in finalizedExisting (retry-after-failure path).
  finalizedExisting?: Record<string, FinalizedPayload>;
  signal?: AbortSignal;
  onProgress: (id: string, state: BakeState, error?: string) => void;
};

export async function runBakeAll(args: Args): Promise<BakeResult>;
```

Behaviour:
1. Initialize `finalized` from `finalizedExisting` (so retries pick up).
2. For each task whose id is not already in `finalized`:
   - `onProgress(id, "baking")`.
   - `POST /api/finalize` with `{ draft: task.draft }` and the SSE bridge from the upload orchestrator.
   - On `finalized` event → store `payload` in `finalized[id]`, emit `onProgress(id, "baked")`.
   - On `gates_failed` / `error` → emit `onProgress(id, "failed", reason)`, return `{ finalized, failedId: id, failedReason: reason }`.
3. Abort signal honored between tasks and after each finalize.
4. Empty `tasks` (or all already-finalized) → no-op.

**Wiring in `StandaloneApp`:**
```ts
async function startBake() {
  if (bakeStatus === "baking") return;
  if (epicTasks.length === 0) return;
  setBakeStatus("baking");
  setBakeError(null);
  // Seed progress for all tasks.
  setBakeProgress(Object.fromEntries(epicTasks.map((t) => [t.id, "pending"])));
  const ac = new AbortController();
  bakeAbortRef.current = ac;
  const bakeTasks: BakeTask[] = epicTasks.map((t) => ({ id: t.id, draft: loadDraft(epicTaskNamespace(t.id)) }));
  const result = await runBakeAll({
    tasks: bakeTasks,
    finalizedExisting: finalizedById,
    signal: ac.signal,
    onProgress: (id, state, error) => {
      setBakeProgress((prev) => ({ ...prev, [id]: state }));
      if (state === "failed") setBakeError({ taskId: id, reason: error ?? "unknown error" });
    },
  });
  bakeAbortRef.current = null;
  setFinalizedById(result.finalized);
  if (result.failedId) {
    setBakeStatus("idle");                    // user can fix + click Bake again
    return;
  }
  setBakeStatus("baked");
  setBakeSelectedId("epic");                 // show the Epic overview first
}

function cancelBake() {
  bakeAbortRef.current?.abort();
}
```

### Phase 3 — `BakeView`

**File:** `components/epic/bake/BakeView.tsx`.

**Layout** (flex row, fills below the header):
- **Left menu** (`w-[280px] shrink-0 border-r border-rule overflow-y-auto flex flex-col`): renders `<BakeNav />`.
- **Main pane** (`flex-1 min-w-0 overflow-y-auto`): conditional —
  - If `bakeSelectedId === "epic"` → `<EpicOverview tasks={epicTasks} />` (just renders `<TaskGraph tasks reviews={{}} assignees={undefined} />`; pass an empty reviews map because there are no more review statuses).
  - Otherwise → `<BakeTaskPreview taskId={bakeSelectedId} finalized={finalizedById[bakeSelectedId]} diagrams={diagramsById[bakeSelectedId]} ... />`.

### `BakeNav` (left menu)

**File:** `components/epic/bake/BakeNav.tsx`.

Renders:
1. **Epic overview** entry (pinned at top) — clicking calls `onSelect("epic")`.
2. **Tasks** section header.
3. One entry per task — title + a ✓ if `finalizedById[id]` exists, ⨯ + small error tooltip if `bakeProgress[id] === "failed"`. Clicking calls `onSelect(id)`.
4. Bottom sticky strip:
   - **Upload all to Jira** (primary button) — fires `onUploadAll`.
   - **← Back to editing** (secondary) — fires `onBackToEditing` which sets `bakeStatus = "idle"` and returns to `EpicEditingView`.

### `BakeTaskPreview` (main pane per-task)

**File:** `components/epic/bake/BakeTaskPreview.tsx`.

This is an adapter around the existing `components/Preview.tsx`. Reads:
- `finalized: FinalizedPayload` (passed in from parent)
- `diagrams: Diagrams | undefined`

Provides:
- `onCreateDiagrams` → POST `/api/diagrams/create` with `{ requirement, story, draft }`; subscribe to `diagrams_created` event; store result in `diagramsById[taskId]`. Loading state via local `creatingDiagrams: boolean`.
- `onEditDiagram(format, source)` → update `diagramsById[taskId][format]`. Mirror SP4 single-task pattern.
- `onRegenerateDiagram(format)` → same as create but for a single format.
- `onAnalyzeDiagrams` → POST `/api/diagrams/analyze`; subscribe to `diagrams_analyzed`; store findings in local state.
- `onApplyAnalysis(ids)` → mirror the single-task `applyAnalysis` shape.
- `onMarkdownChange(next)` → mutate `finalizedById[taskId].payload.markdown`.
- `onHelp` → open a per-task diagrams HelpPanel? Out of scope for v1 (open question — see below).

**Open question (documented):** the single-task `Preview` has an `onHelp` prop that opens a `HelpPanel` with `surface="diagrams"`. In epic mode, we already have a per-task editor HelpPanel mechanism (`analyzeChatById`); whether to plumb a separate per-task *diagrams* HelpPanel through is out of scope for v1. The `onHelp` prop is simply not wired — the button is hidden.

`Preview` already takes all of these as props. The adapter just routes per-task state in/out and uses the existing `Preview` component verbatim.

### Phase 4 — Upload changes (orchestrator + sheet)

**`lib/upload/types.ts`** — `UploadTask` gains:
```ts
export type UploadTask = {
  id: string;
  draft: Draft;
  assignee?: string;
  labels: string[];
  finalizedPayload?: FinalizedPayload;   // SP5: skip finalize when present
  diagrams?: Diagrams;                    // SP5: passed to export as attachments
};
```

**`lib/upload/orchestrator.ts`**:
- `finalizeOne` is gated: `const payload = task.finalizedPayload ?? await finalizeOne(task, args.signal);`
- `exportOne` adds `diagrams: task.diagrams && Object.fromEntries(Object.entries(task.diagrams).filter(([, v]) => v && v.trim()))` to the export body when `task.diagrams` is set.

**`components/StandaloneApp.tsx`** — the inline `onClearTask`-adjacent block that builds `uploadTasks` now also passes the cached `finalizedPayload` + `diagrams`:
```ts
const uploadTasks: UploadTask[] = epicTasks.map((t) => ({
  id: t.id,
  draft: loadDraft(epicTaskNamespace(t.id)),
  labels: t.labels,
  finalizedPayload: finalizedById[t.id],
  diagrams: diagramsById[t.id],
}));
```

Drop the `nonDeniedTaskIds(...)` filter and the `uploadedIssueKey`-skip filter — we don't have Denied any more, and we still want the upload sheet to be the unambiguous "ship everything that's baked" action. (If a task was uploaded in a prior session, that descriptor's `uploadedIssueKey` would block it from re-upload in the orchestrator — but cached `finalizedById` is session-only, so a re-bake is required first. Out of scope to preserve cross-session ship-state.)

### Phase 5 — Reviewer-mode removal

**Files to delete:**
- `components/epic/review/ReviewerMode.tsx`
- `components/epic/review/ReviewNav.tsx`
- `components/epic/review/ReviewTaskPanel.tsx`
- `components/epic/review/ReviewControls.tsx`
- `components/epic/review/EpicPreview.tsx`
- `lib/review/state.ts` (functions move/away)
- `lib/review/types.ts`
- `lib/interference/parse.ts`
- `app/api/interference/route.ts`
- `skills/task-interference/SKILL.md`
- `lib/api/schemas.ts` → drop `InterferenceBodySchema` and the `SubTaskSchema` it uses (only consumer).
- Corresponding test files for everything above.

**`components/epic/review/TaskGraph.tsx`** — keep, but move to `components/epic/TaskGraph.tsx` (it's no longer review-specific). Adjust the one import in the bake view. (Optional move — could also keep in `/review/` and rename folder; chose to move for clarity.)

**`lib/draft/autosave.ts`** — drop `reviewing?: boolean` and `reviews?: ReviewMap` from the `Draft` type. Drop their hydration lines from `loadDraft` (they were optional already; just remove the assignment). Drop the `ReviewMap` import.

**`lib/agent/index.ts`** — drop `runInterferenceAnalysis` export and the `interference` branch in the stub transport.

**Tests deleted:** review-state, review-types-related component tests, interference parse + route tests, the per-task interference integration in StandaloneApp tests.

### Files added (summary)

**New:**
- `components/epic/EpicEditingView.tsx`
- `components/epic/EpicTaskCards.tsx`
- `components/epic/EpicTaskCard.tsx`
- `components/epic/TaskGraph.tsx` (moved from `/review/`)
- `components/epic/bake/BakeView.tsx`
- `components/epic/bake/BakeNav.tsx`
- `components/epic/bake/BakeTaskPreview.tsx`
- `lib/epic/bake.ts`
- Tests for each (`tests/lib/bake.test.ts`, `tests/components/epic/EpicTaskCards.test.tsx`, etc.)

**Modified:**
- `components/StandaloneApp.tsx` — large rewrite of the review/bake/render-gate sections; new bake handlers; updated upload-tasks builder.
- `components/epic/EpicTaskEditor.tsx` — drop the header strip; trim the props.
- `components/epic/EpicTabs.tsx` — **deleted** (replaced by `EpicEditingView`).
- `lib/upload/types.ts` — extend `UploadTask`.
- `lib/upload/orchestrator.ts` — gate `finalizeOne`; pass `diagrams` through.
- Tests for the orchestrator and StandaloneApp.

## Acceptance criteria

### Editing phase
- After generating sub-tasks, the user sees the new 3-column editing layout: the active item's editor on the left/center; a card grid on the right (~280px); the analyze HelpPanel on the far right (~360px) only when analyze is active.
- The first card is "Epic" (pinned, non-deletable). Each sub-task gets one card with its title + a short description preview + a small labels count + a small dependencies count.
- Clicking a card switches the active item in the center editor.
- Each non-Epic card has a × button (visible on hover/focus) with inline confirm; confirming calls `deleteTask(id)`.
- A `+ Add task` tile at the end of the list calls `addTask()`.
- The toolbar's "Analyze all" still starts the existing per-task walk (HelpPanel mounts on the far right; cards remain visible).
- The toolbar's "Bake" disables when `bakeStatus === "baking"`; clicking it starts the eager bake.

### Bake action
- Click Bake → `bakeStatus` becomes `"baking"`. Card grid shows a sticky "Baking N/M…" strip + Cancel button. Each card flips to its bake state as the run progresses.
- The center editor becomes read-only during the run (`pointer-events-none opacity-60`).
- On full success → `bakeStatus = "baked"`, `bakeSelectedId = "epic"`, the screen transitions to the Bake view.
- On any failure → the failing card shows ⨯ + error tooltip; `bakeStatus` returns to `"idle"`; Bake button re-enables. Previously-finalized payloads stay cached, so re-clicking Bake retries only the failed + remaining tasks.
- Cancel aborts at the next safe boundary (between tasks) and returns to `idle`.

### Bake view
- The Bake view shows a left menu (~280px): "Epic overview" pinned at the top, then one entry per task.
- Clicking "Epic overview" shows the existing `TaskGraph` (with the SP4 tighter palette) in the main pane.
- Clicking a task entry shows the per-task Preview surface: finalized markdown textarea, Create diagrams / Edit / Regenerate / Analyze diagrams controls. Diagrams persist per task.
- Each task entry shows a ✓ (or ⨯ + error) indicator based on the bake outcome.
- The bottom of the left menu has **Upload all to Jira** (primary) and **← Back to editing** (secondary).
- **← Back to editing** returns to `EpicEditingView` with all cached state preserved (re-baking is not required if no tasks were edited).
- **Upload all to Jira** opens the existing `UploadSheet` (with the Create-new-epic radio default). The orchestrator skips finalize for tasks whose `finalizedPayload` is cached and passes `diagrams` to export.

### Cleanup
- `components/epic/review/*` is gone except `TaskGraph` (moved to `components/epic/TaskGraph.tsx`).
- `lib/review/*`, `lib/interference/*`, `app/api/interference/`, `skills/task-interference/` are gone.
- `lib/agent/index.ts` no longer exports `runInterferenceAnalysis`; stub transport's `interference` branch is gone.
- `lib/draft/autosave.ts` Draft type no longer has `reviewing` or `reviews` fields.
- Hydration of an OLD persisted draft (one that still contains `reviewing: true` and `reviews: {...}`) succeeds and just ignores those fields.

### Testing
- Unit: `runBakeAll` (happy path, fail-stop, abort, retry skips already-finalized).
- Unit: `runBatchUpload` (cached finalizedPayload skips fetch; cached diagrams ride through to export).
- Component: `EpicTaskCard` (default render, hover-shows-delete, inline-confirm flow, bake state chips, missing onDelete for epic). `EpicTaskCards` (renders epic + tasks + add tile; bake progress strip). `EpicEditingView` (3-column render based on `analyzeTaskId`; bake-disable behavior). `BakeView` + `BakeNav` (selection switches main pane; Upload all + Back fire).
- Integration: StandaloneApp — Bake click runs `runBakeAll`, transitions to Bake view, Upload all opens sheet with `finalizedPayload`s populated.

## Out of scope (later)
- Per-task diagrams HelpPanel ("Ask anything about this diagram") in the Bake view — `Preview.onHelp` exists but stays unwired in epic mode for v1.
- Persisting `finalizedById` + `diagramsById` across sessions (would require localStorage at non-trivial size).
- Per-task "Export to Jira" (single-task) inside the Bake view — only batch upload is supported.
- Re-running Bake on a single task on demand (the existing Bake button retries everything not yet finalized).
- Drafts (save/load epic state) — same future-phase placeholder as before.

## Edge cases
- **Empty epic** (no sub-tasks): Bake button is disabled; the cards grid only shows the Epic card.
- **A task with an empty draft** (e.g., user clicked Clear right before Bake): finalize will fail with "not enough context"; the orchestrator surfaces that as the row's failure and stops the run.
- **Cancel during bake**: the in-flight task may complete and persist its `FinalizedPayload` before the cancel takes effect (the abort signal is checked between tasks). The next task is not started. Subsequent re-Bake will skip the already-finalized one.
- **Old persisted reviewing/reviews fields**: `loadDraft` ignores them (no error). The first save after migration drops them from storage.
- **Help panel + cards interaction**: when the user clicks "Analyze this task" on a sub-task card, the HelpPanel mounts as the third column on the far right; the active editor in the center reflects that task. Closing the HelpPanel collapses the third column.
- **Bake error mid-run**: e.g., task 3 fails. Tasks 1+2 are in `finalizedById`. Bake button re-enables; user can click it again to retry from task 3.
- **Re-opening the editing view from Bake** (`← Back to editing`): all cached bake state is preserved; no re-bake is required to ship if the user didn't change anything.
- **Uploading after a "Back to editing" + editing roundtrip**: if the user edited a task after baking it, the cached `finalizedPayload` is stale. **v1 behavior**: the cache is NOT invalidated automatically; the upload will use the stale finalize result. Users are expected to re-Bake after edits. (Auto-invalidation is a possible v1.1 enhancement — out of scope here.)
