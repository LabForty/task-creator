# Epic Mode — SP2: Generated sub-task list with editing

**Ticket:** AI-36 (Add Epic Mode To Task Creator) — Phase 2
**Date:** 2026-05-27
**Status:** Approved design (user directed plan + implement), ready for implementation plan
**Builds on:** SP1 (`2026-05-27-epic-mode-kneading-sp1-design.md`) — the kneading interview that ends at "Kneading complete".

## Context

AI-36 was decomposed into four sequential sub-projects. SP1 delivered epic-mode entry +
the multi-round kneading interview, ending at a "Kneading complete" state with a disabled
**Generate sub-tasks** button (the SP2 seam). SP2 implements **ticket task group 3**: turning
the kneaded context into an editable list of proposed sub-tasks.

## Scope

**In scope (ticket group 3):**
- AI **generates a proposed sub-task list** from the epic description + the kneaded Q&A.
- Each sub-task has an **editable title** and an **editable description capped at 1500 chars**
  (enforced in the input, with a live counter).
- The user can **add**, **delete**, and **manually create** sub-tasks independent of the AI.
- Each sub-task supports **labels** (AI-proposed + user-editable, including brand-new labels).
- Each sub-task supports **Jira-style blocks / is-blocked-by** references to **other sub-tasks
  in the same epic**.
- Sub-tasks **persist** in the draft (survive reload); re-kneading (lost-dough) clears them.

**Out of scope (later sub-projects):**
- Bake transition, reviewer mode, statuses, assignees, interference analysis (SP3).
- Diagram-from-tasks, Finalize, batch Jira upload, drafts (SP4).
- **Jira label catalog**: the existing Jira client only exposes a *typeahead* label search
  (`searchLabels` → JQL autocomplete), not a full catalog listing. SP2 therefore does **not**
  fetch a catalog during kneading. The AI proposes labels from the epic context, and the
  per-sub-task tag editor accepts existing-or-new free-form labels. Jira label
  reconciliation/validation happens at upload time (SP4). This is a deliberate, documented
  deviation from the ticket's "catalog fetched during kneading" wording, made because the
  backing endpoint does not exist and SP2 stays Jira-optional.

## Decisions

1. **Generation transport:** synchronous `POST /api/subtasks` (request/response), mirroring
   `/api/knead` — not the job/SSE pipeline. A new `task-generate-subtasks` skill + a
   `runGenerateSubtasks` agent helper + a `subtasks` branch in the stub transport.
2. **AI output → indices:** the model returns sub-tasks whose `blocks` are **0-based indices**
   into the returned array (it can't know our generated ids). The client assigns stable ids
   and resolves indices → ids when adopting the proposal.
3. **Link model:** each `SubTask` stores both `blocks: string[]` and `blockedBy: string[]`
   (arrays of other sub-task ids). A **pure reducer keeps them symmetric**: adding "A blocks B"
   also adds B→A in `blockedBy`; deleting a sub-task removes all references to it. Single
   source of truth via the reducer avoids drift.
4. **Description cap:** `maxLength={1500}` on the textarea plus a visible `N/1500` counter.
5. **Labels:** a lightweight tag editor (`LabelsEditor`) — type + Enter to add, × to remove,
   dedupe — seeded with the AI's proposed labels and accepting brand-new labels. No Jira
   dependency in SP2.
6. **Right-pane flow:** at "Kneading complete", **Generate sub-tasks** becomes enabled. On
   click → `POST /api/subtasks` → the right pane switches to the **sub-task list** view.

## Architecture (follows SP1 patterns)

### Pure logic (no SDK / React)
- `lib/subtasks/types.ts` — `SubTask`, `ProposedSubtask`, `SubtaskOutcome`, constants
  (`MAX_DESCRIPTION = 1500`, `MAX_SUBTASKS = 50` defensive cap).
- `lib/subtasks/parse.ts` — `parseSubtasksResponse(raw): ProposedSubtask[]` (tolerant JSON +
  Zod, truncate descriptions to 1500, cap count, validate `blocks` indices in range — drop
  out-of-range), and `ProposedSubtaskSchema`.
- `lib/subtasks/state.ts` — pure reducer:
  - `fromProposed(proposed): SubTask[]` — assign ids, resolve `blocks` indices → ids, derive
    symmetric `blockedBy`.
  - `addSubtask(list)`, `deleteSubtask(list, id)` (also strips that id from every other task's
    `blocks`/`blockedBy`), `updateSubtask(list, id, patch)` (clamps description to 1500),
    `setLabels(list, id, labels)`, `addLink(list, blockerId, blockedId)` /
    `removeLink(list, blockerId, blockedId)` (both maintain symmetry; ignore self-links and
    duplicates), `newSubtask()`.

### AI backend
- `skills/task-generate-subtasks/SKILL.md` — system prompt; input JSON
  `{ epicDescription, rounds }`; output `{ "subtasks": [{ title, description, labels?, blocks? }] }`.
- `lib/agent/index.ts` — `runGenerateSubtasks({ epicDescription, rounds, transport, signal? })`
  → loads the skill, drives the transport, `parseSubtasksResponse`, returns `ProposedSubtask[]`.
  Plus a `subtasks` branch in `makeStubTransport` returning a deterministic 2-item proposal
  (with one `blocks` link) so tests run offline.
- `lib/api/schemas.ts` — `SubtasksBodySchema` (`{ epicDescription: string.min(1), rounds }`,
  reusing the knead round shape).

### Route
- `app/api/subtasks/route.ts` — `POST`, mirrors `app/api/knead/route.ts` (requireSession,
  origin allowlist, Zod safeParse, `makeTransport()` + `runGenerateSubtasks`, returns
  `{ subtasks: ProposedSubtask[] }`; 400/403/500).

### State / persistence
Extend `Draft`:
```ts
subtasks?: SubTask[];
```
StandaloneApp owns `subtasks` and persists it (extend `persistEpic` to also write `subtasks`,
or add `persistSubtasks`). The Editor's autosave must **preserve `subtasks`** from storage the
same way it already preserves `mode`/`knead` (StandaloneApp is the sole writer). Re-kneading
(lost-dough confirm) clears `subtasks`.

### UI components (`components/epic/`)
- `LabelsEditor.tsx` — `{ value: string[]; onChange; disabled? }` tag input (Enter to add, ×
  to remove, dedupe via existing `normalizeLabel`/`dedupeLabels` in `lib/jira/metadata.ts`).
- `SubtaskLinksField.tsx` — `{ subtask, allSubtasks, onAddLink, onRemoveLink }`; two pickers
  ("Blocks" / "Blocked by") listing the **other** sub-tasks (by title) and showing current
  links with × to remove.
- `SubtaskCard.tsx` — one sub-task: title `TextField`, description `TextArea`
  (`maxLength={1500}` + counter), `LabelsEditor`, `SubtaskLinksField`, and a delete button.
- `SubtaskList.tsx` — renders the cards + an **Add sub-task** button; props wire to the
  reducer handlers in StandaloneApp.

### Wiring (`components/StandaloneApp.tsx`, `components/epic/KneadingPanel.tsx`)
- KneadingPanel's **Generate sub-tasks** button: enabled when `status === "complete"`; add an
  `onGenerate` prop + `generating` loading state; clicking calls back into StandaloneApp.
- StandaloneApp: `generateSubtasks()` → `POST /api/subtasks` with `{ epicDescription, rounds }`
  → `setSubtasks(fromProposed(proposed))` + persist. Once `subtasks` is non-empty, the right
  pane renders `SubtaskList` (instead of the completed-interview view). Handlers: add, delete,
  update (title/description), setLabels, addLink, removeLink — each persists. Error + loading
  surfaced inline.

## UI flow

1. Kneading complete → **Generate sub-tasks** enabled.
2. Click → loading → right pane shows the **sub-task list**: each card has title, description
   (with `N/1500` counter), labels, and Blocks / Blocked-by pickers referencing other cards.
3. User edits any field, deletes a card, or clicks **Add sub-task** for a blank one.
4. Everything persists to the draft; a reload restores the list.
5. Editing the epic description re-triggers the existing **lost-dough** warning; confirming a
   re-knead clears the sub-tasks (and the dough) per the warning's stated behavior.

## Edge cases

- AI returns >`MAX_SUBTASKS` → truncate; description >1500 → truncated on parse and clamped on
  edit; `blocks` index out of range → dropped.
- Deleting a sub-task removes every dangling link to it (no orphan references).
- `addLink` ignores self-links and duplicates and keeps `blocks`/`blockedBy` symmetric.
- Manual sub-tasks (empty title/description) are allowed; no Jira/title gating in SP2.
- `/api/subtasks` failure → inline error + retry; existing sub-tasks/draft preserved.
- No Jira connection → labels still work as free-form tags.

## Testing

- **Vitest (unit):** `lib/subtasks/parse.ts` (tolerant parse, 1500 truncation, count cap,
  index validation), `lib/subtasks/state.ts` (fromProposed id+link resolution, add/delete with
  link cleanup, update clamp, symmetric addLink/removeLink, self/dup guards), and the
  `runGenerateSubtasks` + stub.
- **Vitest (component, Testing Library + user-event):** `LabelsEditor`, `SubtaskLinksField`,
  `SubtaskCard` (1500 counter + cap), `SubtaskList`, and the `/api/subtasks` route.
- **StandaloneApp integration test:** from kneading-complete → Generate → list renders →
  edit/add/delete/link → assert persistence in localStorage.
- **e2e:** skipped for this phase (per project decision), consistent with SP1.
