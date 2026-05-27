# Epic Mode — SP3: Bake + reviewer mode + interference analysis

**Ticket:** AI-36 (Add Epic Mode To Task Creator) — Phase 3
**Date:** 2026-05-27
**Status:** Approved design (user directed plan + implement), ready for implementation plan
**Builds on:** SP1 (kneading) + SP2 (sub-task list). After SP2 the user has an editable list of sub-tasks.

## Context

Implements ticket task groups 4, 5, 6: a **Bake** action that finalizes the kneaded
artifacts and transitions into a **reviewer mode**, per-task review **statuses / comments /
assignees**, and an AI **interference analysis** when a task is edited during review.

## Scope

**In scope:**
- A **Bake** button (in the sub-task list view) that transitions the epic area into reviewer mode.
- **Reviewer mode** layout: a left pane with the epic **markdown/preview**, status-colored
  **navigation** entries (epic + one per task), and a **Diagrams** section; a main pane showing
  the selected task.
- Per-task **status**: `pending` / `approved` (green) / `denied` (red) / `change_requested`
  (yellow); the navigation entry reflects the status by color.
- **Change-requested requires a comment** on that task before the status is applied.
- Per-task **assignee** (set in reviewer mode).
- Tasks **remain editable** in reviewer mode (title, description, labels, links — reuse SP2's
  `SubtaskCard`).
- **Interference analysis**: editing a task runs an AI analysis that surfaces **warnings on
  other potentially affected tasks with a reason**; it **never auto-edits** other tasks.
- Reviewer state (`reviewing`, `reviews`) **persists** in the draft.

**Out of scope (Phase 4 / SP4):**
- **Finalize** (the gated action) → batch Jira upload / save draft (group 7/8). SP3 shows a
  **disabled Finalize** button as the SP4 seam, with the ticket's hint text.
- **Create diagram from tasks** (group 7). The reviewer "Diagrams" section is a placeholder.
- **Assignee → real Jira users**: no user-search endpoint exists in the app today, so assignee
  is **free-text** (display name/email) in SP3; resolution to a Jira account happens at upload
  (SP4). Documented deviation from "assigned to a user", made because the backing endpoint is
  absent and SP3 stays Jira-optional.
- **Epic "markdown"** is rendered from the epic title + description (already TipTap HTML) + a
  task summary; no markdown-to-HTML library is introduced.

## Decisions

1. **Reviewer mode replaces the epic editing area** when `reviewing` is true (the header,
   Jira chip, etc. stay). It is a two-pane layout inside the existing main column + a sidebar.
2. **Review state model:** a parallel map keyed by sub-task id (`reviews`), separate from
   `SubTask`, so SP2's editing/reducer API is untouched. `reviewing: boolean` flags the phase.
3. **Status + comment rule:** Approve/Deny apply immediately. Selecting **Change requested**
   reveals a required comment field; the status is applied only when a non-empty comment is
   submitted.
4. **Interference trigger:** any task edit (title/description/labels/links) schedules a
   **debounced** (≈400 ms) `POST /api/interference`; results populate a transient
   `interference` map (`affectedTaskId → { reason, sourceTaskId }`) shown on the affected
   tasks' nav entries and panels. Warnings are advisory; no auto-edit.
5. **Assignee = free-text**; **Diagrams = placeholder**; **Finalize = disabled seam**.

## Architecture (mirrors SP1/SP2)

### Pure logic
- `lib/review/types.ts` — `ReviewStatus = "pending"|"approved"|"denied"|"change_requested"`,
  `SubtaskReview = { status, comment, assignee: string|null }`, `ReviewMap = Record<string, SubtaskReview>`,
  `EMPTY_REVIEW`, and the interference types `InterferenceWarning = { affectedTaskId, sourceTaskId, reason }`.
- `lib/review/state.ts` — `getReview(map, id)` (defaulted), `setReview(map, id, patch)`,
  `initReviews(ids, existing?)` (ensure a `pending` entry per id, keep existing), `pruneReviews(map, validIds)`,
  `allReviewed(ids, map)` (every id approved or denied — for the future Finalize gate).
- `lib/interference/parse.ts` — `parseInterferenceResponse(raw): InterferenceWarning[]` (shared
  `extractJsonObject`, Zod, drop warnings whose `affectedTaskId` is unknown / equals source).

### AI backend
- `skills/task-interference/SKILL.md` — input `{ epicDescription, editedSubtask, allSubtasks }`;
  output `{ "interference": [{ "affectedTaskId", "reason" }] }`.
- `lib/agent/index.ts` — `runInterferenceAnalysis({ epicDescription, editedSubtask, allSubtasks, transport, signal? })`
  → returns `InterferenceWarning[]` (sets `sourceTaskId = editedSubtask.id`). Stub branch
  `interference` returns a deterministic warning on the **first task that is not the edited one**
  (so tests can assert a visible warning), or `{ interference: [] }` when there is no other task.
- `lib/api/schemas.ts` — `InterferenceBodySchema` (`epicDescription`, `editedSubtask`, `allSubtasks`).
- `app/api/interference/route.ts` — `POST`, mirrors `/api/subtasks`.

### State / persistence
Extend `Draft`:
```ts
reviewing?: boolean;
reviews?: ReviewMap;
```
StandaloneApp owns them and persists via the existing read-merge-write helper; the Editor's
autosave **preserves `reviewing`/`reviews`** alongside `mode`/`knead`/`subtasks`. `interference`
is transient (component state, not persisted). Re-kneading (lost-dough) clears reviewing/reviews
too.

### UI components (`components/epic/review/`)
- `ReviewControls.tsx` — `{ review, onChange(patch) }`: Approve / Deny buttons (apply
  immediately), a **Change requested** button that reveals a required comment + Apply, an
  editable comment field, and a free-text **Assignee** input.
- `ReviewNav.tsx` — `{ subtasks, reviews, selectedId, onSelect, interference }`: an **Epic**
  entry then one entry per task, each colored by status (`success`/`danger`/`warning`/neutral),
  with a warning marker when the task has an interference warning.
- `EpicPreview.tsx` — `{ title, descriptionHtml, subtasks }`: read-only epic overview (title,
  rendered description HTML in `.tiptap-prose`, task-title list). This is the "Markdown" content.
- `ReviewTaskPanel.tsx` — `{ subtask, allSubtasks, review, warning?, onUpdate, onSetLabels, onAddLink, onRemoveLink, onReviewChange }`:
  composes SP2's `SubtaskCard` (editing) + `ReviewControls` + an interference warning banner
  when `warning` is set.
- `ReviewerMode.tsx` — the full layout: sidebar (`EpicPreview` + `ReviewNav` + a Diagrams
  placeholder + a **disabled Finalize** button with the hint
  "You need to review all the tasks and resolve requested changes") and a main pane rendering
  the selected `ReviewTaskPanel` (defaults to the first task).

### Wiring (`components/StandaloneApp.tsx`, `components/epic/SubtaskList.tsx`)
- `SubtaskList`: add a **Bake** button (header) + `onBake` prop.
- StandaloneApp: `reviewing` + `reviews` + `interference` state; `bake()` sets `reviewing=true`
  and `reviews = initReviews(subtask ids)`, persists; render `ReviewerMode` (replacing the
  sub-task editing area + right pane) when `reviewing`; review handlers (`setReview` via
  reducer, persisted); edit handlers reuse SP2's `commitSubtasks` and additionally schedule the
  debounced interference call; `confirmReKnead` clears `reviewing`/`reviews`. A way back to
  editing (e.g. an "Edit tasks" affordance in reviewer mode) returns `reviewing=false`.

## UI flow
1. Sub-task list → **Bake** → reviewer mode (reviews initialized to `pending`).
2. Left sidebar: epic preview, status-colored task nav, Diagrams placeholder, disabled Finalize.
3. Select a task → main pane shows it: editable fields + Approve/Deny/Change-requested + comment
   + assignee.
4. Editing a task → debounced interference analysis → warnings appear on affected tasks.
5. Change-requested → comment required before applied; nav recolors by status.
6. Editing the epic description (if reachable) or re-kneading clears review state via lost-dough.

## Edge cases
- Bake initializes a review per current task; tasks added later default to `pending`
  (`initReviews` keeps existing + adds missing).
- Deleting a task in reviewer mode prunes its review + any interference entry.
- `change_requested` cannot be applied with an empty comment (enforced in `ReviewControls`).
- Interference: warnings reference only known other-task ids (unknown/self dropped on parse);
  `/api/interference` failure is non-fatal (warnings simply not updated; surfaced subtly).
- No Jira connection → assignee still works (free text); Finalize stays disabled regardless.

## Testing
- **Vitest (unit):** `lib/review/state.ts` (defaults, setReview, initReviews keep/add,
  pruneReviews, allReviewed), `lib/interference/parse.ts` (validation, drop unknown/self),
  `runInterferenceAnalysis` + stub.
- **Vitest (component):** `ReviewControls` (approve/deny immediate; change-requested gated on
  comment; assignee edit), `ReviewNav` (status colors + selection + warning marker),
  `EpicPreview`, `ReviewTaskPanel` (editing bubbles + warning banner), `ReviewerMode` (layout +
  disabled Finalize + select), `/api/interference` route.
- **StandaloneApp integration:** subtasks → Bake → reviewer renders → set a status (incl.
  change-requested comment gate) → edit a task → interference warning appears on another task →
  assert persistence of `reviewing`/`reviews`.
- **e2e:** skipped (per project decision), consistent with SP1/SP2.
