# Epic Mode — Tabbed sub-task editor + Analyze-all (refactor)

**Ticket:** AI-36 (Add Epic Mode To Task Creator)
**Date:** 2026-05-27
**Status:** Approved design, ready for implementation plan
**Supersedes:** the *editing surface* of SP2 (the `SubtaskCard`/`SubtaskList` inline list). Reuses SP2's generation pipeline + label/link components and SP3's reviewer mode (with adapters).

## Description

Today the generated sub-tasks are edited in a bespoke `SubtaskCard` list (title, description, labels, blocks/blocked-by). This refactor makes each sub-task editable through the **full single-task editor** — the same one used to author a standalone task — surfaced as **tabs**. The epic is the "main task" and gets its own tab; each generated sub-task gets a tab. Selecting a tab loads that item into the single-task `Editor` (title, description, acceptance criteria, constraints, task type, Help, diagrams). A toolbar **Analyze all** button refines every task's draft one-by-one with a single AI pass. When the author is satisfied, **Bake** transitions into the existing reviewer mode (statuses / comments / assignee / interference) and then to Jira upload (SP4).

End-to-end flow: **knead → Generate sub-tasks → tabbed editor → Analyze all → Bake → reviewer mode → upload.**

## Decisions (from brainstorming)

1. **Analyze all = refine drafts only** — one AI pass per task improving `{title, description, acceptanceCriteria}`. No finalize gates, no diagrams.
2. **Tabs reuse the single-task Editor**, one tab per sub-task plus an Epic tab.
3. **Per-task namespace** — each task's content lives in its own Editor draft (`standalone:epic:<id>`); the existing `Editor` is pointed at that namespace. Epic state holds only lightweight descriptors + labels/links/review.
4. **Reviewer mode (SP3) stays** after Analyze, reading task title/description from the per-task drafts.
5. **Keep** per-task labels + blocks/blocked-by (a compact strip in each task tab).
6. The **Epic tab** edits the epic's own title/description; **lost-dough re-knead** only applies during the pre-generation kneading phase, not once sub-tasks exist.

## Architecture

### Data model
The authoritative editable content of each sub-task moves into a **per-task Editor draft** at namespace `standalone:epic:<taskId>` (the same localStorage autosave the single-task editor already uses). The main `standalone` draft keeps a lightweight, ordered descriptor list (replacing `subtasks: SubTask[]`):

```ts
// lib/epic/tasks.ts (types)
export type EpicTask = {
  id: string;
  title: string;       // mirror of the per-task draft's title — for tab/nav labels only
  labels: string[];
  blocks: string[];    // ids of tasks this one blocks
  blockedBy: string[]; // ids of tasks that block this one
};
```

Added to `Draft`: `epicTasks?: EpicTask[]` (retires `subtasks?: SubTask[]`). `reviews` (SP3) stays keyed by task id. The per-task draft holds `{ title, description, acceptanceCriteria, constraints, taskType, diagrams }` — the standard `Draft` shape.

`title` is denormalized into `EpicTask` so tab/nav labels render without reading every per-task draft; it is kept in sync via the Editor's existing `onDraftChange` callback.

### Pure logic
- `lib/epic/tasks.ts` — `EpicTask` type + a pure descriptor reducer: `newEpicTask()`, `addEpicTask(list)`, `deleteEpicTask(list, id)` (removes descriptor + strips its id from every other task's blocks/blockedBy), `setTitle(list, id, title)`, `setLabels(list, id, labels)` (dedupe), `addLink(list, blockerId, blockedId)` / `removeLink(...)` (symmetric, ignore self/dup), `descriptorsFromProposed(proposed)` → `EpicTask[]` (assign ids, resolve `blocks` indices→ids, derive symmetric `blockedBy`). Mirrors SP2's `lib/subtasks/state.ts` but on descriptors only (no title/description content). The per-task draft *seeds* (title/description) are returned alongside so the caller can write them.
- `lib/refine/parse.ts` — `parseRefineResponse(raw): { title; description; acceptanceCriteria: string[] }` (shared `extractJsonObject` + Zod; description truncated to a sane cap; AC array of strings).

### AI backend
- `skills/task-refine/SKILL.md` — input `{ epicDescription, draft: { title, description, acceptanceCriteria, constraints } }`; output `{ "title": "...", "description": "...", "acceptanceCriteria": ["...", "..."] }`. Improves clarity/specificity in one pass; does not invent scope.
- `lib/agent/index.ts` — `runRefine({ epicDescription, draft, transport, signal? })` → `{ title, description, acceptanceCriteria }`; plus a `refine` branch in `makeStubTransport` returning a deterministic improved draft.
- `lib/api/schemas.ts` — `RefineBodySchema` (`epicDescription`, `draft`).
- `app/api/refine/route.ts` — `POST`, mirrors `/api/subtasks`.

### Editor reuse
`components/Editor.tsx` gains a `hideSubmit?: boolean` prop. When set: render no primary submit button and make the form `onSubmit` a no-op (Help/AC/title-suggest/diagrams all still work). The epic-tab and reviewer contexts pass `hideSubmit` because **Analyze all** / **Bake** / per-task review drive the flow, not a per-task Finalize. Its autosave preserve-list updates `subtasks`→`epicTasks` (keeps StandaloneApp the sole writer of epic metadata).

### UI components (`components/epic/`)
- `EpicTaskEditor.tsx` — one task's full editor: `<Editor namespace={`standalone:epic:${taskId}`} hideSubmit onDraftChange={d => onTitleChange(d.title)} onHelp={…} />` + a compact **dependencies + labels** strip (`LabelsEditor` for `labels`, `SubtaskLinksField` fed the other `EpicTask`s for blocks/blocked-by) + a **Delete task** button. Props: `{ taskId, allTasks: EpicTask[], labels, blocks, blockedBy, refreshKey, onTitleChange, onSetLabels, onAddLink, onRemoveLink, onDelete }`. `refreshKey` is part of the `Editor` `key` so a programmatic draft change (Analyze refine) re-hydrates the visible Editor.
- `EpicTabBar.tsx` — `{ tasks: {id,title}[], active: "epic" | string, onSelect, onAdd }`: an "Epic" tab, one tab per task (title or "(untitled)"), and a `＋` add-task control.
- `EpicTabs.tsx` — composes `EpicTabBar` + a toolbar (**Analyze all** with progress, **Bake**) + the active pane: Epic tab → `<Editor namespace="standalone" hideSubmit … />`; task tab → `<EpicTaskEditor … />`.

### Reviewer mode (SP3) adaptation
- `ReviewerMode` / `ReviewNav` / `EpicPreview` read each task's title (from the `EpicTask` mirror) and description (via `loadDraft('standalone:epic:<id>')`) instead of a `SubTask` object.
- `ReviewTaskPanel` swaps its `SubtaskCard` for the shared `EpicTaskEditor` (so editing during review uses the same per-task Editor) + keeps `ReviewControls` + the interference banner.
- Interference (`/api/interference`) takes a lightweight `{id,title,description}[]` derived from descriptors + drafts (the route's `SubTaskSchema` is loosened to the fields actually used, or an adapter maps to it).

### Wiring (`components/StandaloneApp.tsx`)
- **Generate sub-tasks** → `descriptorsFromProposed(proposed)` for the descriptors; for each, `saveDraft('standalone:epic:<id>', seededDraft)` with the proposed title+description; set `epicTasks`; select the first task tab.
- Render `EpicTabs` (replacing the SubtaskList aside) once `epicTasks.length > 0` and not yet `reviewing`.
- **Analyze all**: iterate `epicTasks` sequentially; per task `loadDraft(ns)` → `POST /api/refine` → merge `{title,description,acceptanceCriteria}` → `saveDraft(ns)` → update the descriptor's `title` mirror; bump `refreshKey`; show "Analyzing N/M…"; inline error + continue/stop on failure.
- **Add task** (`＋`): create id + empty `standalone:epic:<id>` draft + descriptor; select it.
- **Delete task**: `deleteEpicTask`, remove its draft (`clearDraft(ns)`), prune `reviews`/interference, reselect.
- **Bake / reviewer / re-knead-clear**: as SP3, operating on `epicTasks` + per-task drafts; re-kneading clears `epicTasks` and their drafts.
- **Lost-dough**: only armed while `epicTasks` is empty (pre-generation). Once tasks exist, editing the epic (Epic tab) does not re-arm it.

## Acceptance criteria

- Generating sub-tasks produces one tab per sub-task plus an **Epic** tab; the first task tab is selected.
- Selecting a tab loads that item into the full single-task editor (title, description, acceptance criteria, constraints, task type, Help, diagrams); the Editor shows **no** Finalize/Knead button here.
- Edits in a tab persist (per-task autosave) and survive reload; the tab/nav label reflects the task's current title.
- Each task tab exposes per-task **labels** and **blocks / blocked-by** links to other tasks; `＋` adds a blank task; **Delete** removes a task, its draft, and any dangling links/review.
- The **Epic** tab edits the epic's own title/description and does **not** trigger the lost-dough re-knead warning once sub-tasks exist.
- **Analyze all** refines every task one-by-one (visible progress), updating each task's title/description/acceptance criteria in place; a per-task failure is surfaced without losing already-refined tasks.
- **Bake** still transitions into reviewer mode; statuses/comments/assignee/interference work, reading task content from the per-task drafts; editing a task in reviewer mode uses the same per-task editor.
- Re-kneading (lost-dough confirm) clears all sub-tasks and their per-task drafts.
- All AI calls are synchronous routes with deterministic stubs; unit/component tests cover the descriptor reducer, refine parse/route, the tab components, and the StandaloneApp integration (generate → tabs → analyze → bake). e2e skipped (per project decision).

## Out of scope (later)
- Diagram-from-tasks, Finalize gating, batch Jira upload, drafts (SP4).
- Migrating any persisted v-prior `subtasks` drafts to `epicTasks` (greenfield; old in-progress epics reset).

## Edge cases
- A task with an empty title shows "(untitled)" in its tab/nav.
- Analyze-all on zero tasks is a no-op; a `/api/refine` failure for one task leaves that task's draft unchanged and continues (or stops) with a surfaced error.
- Deleting the active task selects a neighbor (or the Epic tab if none remain).
- Per-task draft namespaces are cleaned up on delete and on re-knead so localStorage doesn't accumulate orphans.
