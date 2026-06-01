# Epic Mode — Review gate (per-task statuses + upload gating)

**Ticket:** AI-36 (Add Epic Mode To Task Creator) — reviewer slice
**Date:** 2026-06-01
**Status:** Approved design (user said "continue"), ready for implementation plan
**Builds on:** The as-built bake flow (`BakeView` / `BakeNav` / `finalizedById`) and SP4's
batch upload (`UploadSheet` + `lib/upload`).

## Context

Ticket task groups 5 + 7 describe a reviewer mode where each baked task is marked
**Approved / Denied / Change-requested**, and the final upload is **disabled until every task is
resolved**. The earlier `2026-05-27-epic-mode-reviewer-sp3-design.md` planned this with a bespoke
`ReviewerMode` / `ReviewMap` component tree, but the code that actually shipped reshaped the
reviewer into the **bake** flow: `BakeView` + `BakeNav` (left nav) + `BakeTaskPreview`, with
finalized payloads in `finalizedById` and SP4's `UploadSheet`. In that reshape the **per-task
review status was dropped** — today `BakeNav` shows only a baked `✓`, and `UploadSheet` is invoked
with `denied={[]}` and uploads every task unconditionally.

This slice re-introduces the review gate **on the as-built bake architecture**, reusing the
denied-exclusion plumbing SP4 already built.

## Scope

**In scope:**
- Per-task **status**: `approved` (green) / `denied` (red) / `change_requested` (yellow);
  unreviewed = neutral. Applies to tasks only — not the "Epic overview" nav entry.
- A **comment** per task: free-text, allowed under **any** status, **required** when
  `change_requested`.
- `BakeNav` task entries show a **status color dot** and a **💬 marker** whenever a comment exists
  ("we annotated / did something to this task" indicator). The existing failed `⨯` mark stays.
- The **"Upload all to Jira"** button is **disabled until every task is `approved` or `denied`**
  (any `change_requested` or unreviewed task keeps it disabled), with the ticket's hint beneath it:
  *"You need to review all the tasks and resolve requested changes."*
- **Denied tasks are excluded** from the upload and shown in the UploadSheet's existing "Excluded"
  list; approved tasks are uploaded.
- Review status + comment **persist in the draft** (added to the `EpicTask` descriptor, which is
  already autosaved — same mechanism as `uploadedIssueKey`).

**Out of scope (later AI-36 slices):**
- **Assignee** per task.
- **Interference analysis** on reviewer edits (ticket task 6).
- **Create diagram from tasks** (ticket task 7).
- **Save as draft / per-ticket batch checkbox selection** (ticket task 8). Because the
  save-as-draft fork is not built, the button stays labeled **"Upload all to Jira"** rather than
  the ticket's "Finalize".

## Data model

Extend `EpicTask` (`lib/epic/tasks.ts`):
```ts
export type ReviewStatus = "approved" | "denied" | "change_requested";
// new optional fields on EpicTask:
reviewStatus?: ReviewStatus;   // undefined = not yet reviewed
reviewComment?: string;        // free text; required only when change_requested
```
Optional fields keep existing drafts backward-compatible (older drafts deserialize with both
`undefined`). `newEpicTask()` leaves them unset.

## Pure logic — `lib/epic/review.ts` (new, focused)
- `setReviewStatus(list, id, status: ReviewStatus): EpicTask[]`
- `setReviewComment(list, id, comment: string): EpicTask[]`
- `isReviewComplete(tasks): boolean` — `tasks.length > 0 && tasks.every(t => t.reviewStatus === "approved" || t.reviewStatus === "denied")`
- `tasksForUpload(tasks): EpicTask[]` — `reviewStatus === "approved"`
- `deniedTasks(tasks): { id: string; title: string }[]` — `reviewStatus === "denied"`

These are pure array transforms mirroring the existing helpers in `lib/epic/tasks.ts`.

## UI

### `TaskReviewBar.tsx` (new, `components/epic/review/`)
Props: `{ status?: ReviewStatus; comment: string; onStatusChange(s): void; onCommentChange(c): void }`.
- Three segmented buttons **Approve / Deny / Request change** reflecting the current status.
- A comment textarea, always editable.
- Selecting **Request change** with an empty/whitespace comment is blocked: the status is not
  applied and an inline message prompts for a comment. Approve/Deny apply immediately.
- Comment persists independent of status (user can comment on an approved task).

### `BakeView` / `BakeNav` changes
- `BakeView` renders `TaskReviewBar` **above** `BakeTaskPreview` in the selected-*task* branch
  only (not the epic-overview branch). It threads review props/handlers through.
- `BakeNav` task entries: replace/augment the lead area with a status **color dot**
  (`success`/`danger`/`warning`, neutral when unset) and append a **💬** when
  `reviewComment` is non-empty. The "Upload all to Jira" button takes a `disabled` flag; when
  disabled, render the hint text beneath it.

### Wiring — `StandaloneApp.tsx`
- Add handlers `handleSetReviewStatus(id, status)` and `handleSetReviewComment(id, comment)` that
  call the `lib/epic/review.ts` helpers on `epicTasks` (state update → existing autosave persists).
- Pass review state + handlers + `disabled={!isReviewComplete(epicTasks)}` into `BakeView`.
- At the `UploadSheet` call site (currently `tasks=all, denied=[]`): build `uploadTasks` from
  `tasksForUpload(epicTasks)` and pass `denied={deniedTasks(epicTasks)}`. No change to
  `lib/upload` or `UploadSheet` internals — they already exclude denied and render an "Excluded"
  list.

## Edge cases
- **No tasks:** `isReviewComplete` returns `false` → button disabled (nothing to upload). Consistent.
- **All denied:** `tasksForUpload` is empty → `UploadSheet.canStart` already guards on
  `tasks.length > 0`, so Start is disabled; the sheet still lists denied as excluded.
- **Change-requested with empty comment:** never applied (enforced in `TaskReviewBar`); such a task
  stays unreviewed/neutral and keeps the gate closed.
- **Re-kneading (lost dough):** rebuilding `epicTasks` from proposed subtasks naturally drops review
  fields (new descriptors) — review state resets, matching the "all dough lost" warning. No extra code.
- **Backward-compat:** drafts saved before this change have no review fields → treated as unreviewed.

## Testing (TDD)
- **Vitest (unit) — `lib/epic/review.ts`:** `setReviewStatus`/`setReviewComment` immutability +
  targeting; `isReviewComplete` truth table (empty list, unreviewed, change_requested, mixed,
  all approved/denied); `tasksForUpload` (approved only); `deniedTasks` (id+title).
- **Vitest (component) — `TaskReviewBar`:** approve/deny apply immediately; change-requested blocked
  on empty comment then applied once comment present; comment editable under any status.
- **Vitest (component) — `BakeNav`:** status color dot per status; 💬 marker when comment present;
  "Upload all" disabled + hint when `disabled`, enabled otherwise.
- **StandaloneApp.epic integration:** bake → mark statuses (incl. change-requested comment gate) →
  upload button enables only when all approved/denied → opening UploadSheet passes approved as
  `tasks` and denied as `denied`; assert review fields persist in the draft.
- Update existing `BakeNav` / `BakeView` / `StandaloneApp.epic` / `UploadSheet` tests for new props.
- **e2e:** skipped, consistent with prior epic-mode slices.
