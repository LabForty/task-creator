# Epic Mode — SP1: Mode entry + kneading interview

**Ticket:** AI-36 (Add Epic Mode To Task Creator)
**Date:** 2026-05-27
**Status:** Approved design, ready for implementation plan

## Context

AI-36 introduces an entire "epic authoring mode" in the task creator — a bakery-metaphor
workflow (knead → bake → review) that turns a free-form epic description into a reviewed
batch of Jira sub-tasks. The full ticket spans 8 task groups and is far too large for a
single spec. It has been **decomposed into four sequential sub-projects**, each shipped with
its own spec → plan → implementation cycle:

- **SP1 (this spec):** Epic mode entry + the kneading interview (ticket groups 1 & 2)
- **SP2:** Sub-task generation & editing — list, labels, inter-task blocks links (group 3)
- **SP3:** Bake + reviewer mode — statuses, assignees, interference analysis (groups 4, 5, 6)
- **SP4:** Diagram-from-tasks + Finalize + batch Jira upload + drafts (groups 7, 8)

This document specifies **SP1 only**.

## Scope

**In scope:**
- A dedicated **Single task / Epic** mode switch in the header.
- The existing left-pane epic entry experience, preserved; in epic mode the
  "Finalize task" button becomes "Knead tasks".
- A multi-round, AI-driven **kneading interview** on the right pane covering business and
  technical dimensions, up to 25 questions per round.
- Per-question input types chosen by the AI: free-text, single-select, multi-select.
- Answered questions **mirrored read-only** beneath the epic description on the left pane
  (no edit affordance).
- Interview loop **capped at 5 rounds**; beyond the cap, a yes/no prompt with the AI's
  justification continues the loop only on explicit user approval.
- **Lost-dough warning** when the epic description is edited after kneading has begun,
  with a single yes/no "keep already-answered questions" checkbox.
- A **"Kneading complete"** end state showing the assembled context, with a disabled
  "Generate sub-tasks" button marking the SP2 seam.

**Out of scope (later sub-projects):**
- Sub-task generation, editing, labels, inter-task links (SP2).
- Bake transition, reviewer mode, interference analysis (SP3).
- Diagram-from-tasks, Finalize, batch Jira upload, drafts (SP4).
- SP1 does **not** require a Jira connection. The label catalog "fetched during kneading"
  mentioned in the ticket is deferred to SP2, where it is actually consumed.

## Decisions (from brainstorming)

1. **Mode entry:** a dedicated `Single task / Epic` segmented control in the header,
   independent of the existing `TaskTypePicker`. (Not tied to task type = epic.)
2. **Interview presentation:** "form round" — the whole round is rendered as a scrollable
   list of question fields grouped Business / Technical; the Knead button enables once all
   are answered. (Not one-at-a-time conversational.)
3. **Answer format:** the AI specifies an input type per question (`text` / `single` /
   `multi` with options); the UI renders the matching control.
4. **SP1 end state:** stop at "Kneading complete" showing the assembled context with a
   disabled "Generate sub-tasks" affordance. No throwaway stub code.

## Architecture

Follows existing codebase patterns. No new state-management library, no new UI primitive
library — pure React hooks + localStorage autosave, HIG design tokens, existing UI
components.

### UI components
- New kneading/epic components live alongside `components/Editor.tsx` and are composed in
  `components/StandaloneApp.tsx` (the existing "god component" that owns app mode).
- Reuse `components/ui/SegmentedControl.tsx` (mode switch), `components/ui/Button.tsx`,
  `components/ui/TextField.tsx`.
- Style with existing HIG tokens only: `text-hig-body` / `text-hig-footnote` /
  `text-hig-subhead` / `text-hig-caption`, `bg-surface` / `bg-surface-muted` /
  `bg-surface-inset`, `border-rule`, and the `accent` / `success` / `warning` / `danger`
  color ramps with their `-tint` variants. Lost-dough warning uses `warning` styling.

### AI backend
- New `prompts/knead.md` and `skills/task-knead/SKILL.md`, loaded from disk at runtime the
  same way `prompts/analyst.md` / `prompts/planner.md` are (changes don't require rebuild).
- A `runKnead()` helper in `lib/agent` and a small `lib/knead/` orchestrator that parses the
  model's JSON output with the existing tolerant `parseSkillJson` (handles markdown fences
  and surrounding prose).
- Validate parsed output against a Zod schema (consistent with the analyst/planner pipeline).

### Transport
- **Synchronous `POST /api/knead`** (request/response), *not* the job/SSE pipeline used by
  `/api/finalize`. A kneading round is a batch of questions, so there is nothing to stream
  token-by-token. The UI shows a loading state while a round is generated.

## AI contract: `POST /api/knead`

**Request body:**
```ts
{
  epicDescription: string;
  rounds: Array<{
    questions: KneadQuestion[];
    answers: Record<string /* question id */, string | string[]>;
  }>;
  overrideCapApproved?: boolean; // set true only after the user approves exceeding 5 rounds
}
```

**Response (exactly one of):**
```ts
// More questions for the next round
{
  kind: "questions";
  round: {
    questions: Array<{
      id: string;
      prompt: string;
      section: "business" | "technical";
      type: "text" | "single" | "multi";
      options?: string[]; // present for single/multi
    }>;
  };
}

// AI has no further questions → land on "Kneading complete"
{ kind: "complete" }

// 5 rounds already done and the AI wants more context
{ kind: "cap_reached"; justification: string }
```

**Rules:**
- A round contains **at most 25 questions**; the server defensively truncates to 25 if the
  model returns more.
- `single`/`multi` questions must include a non-empty `options` array; `text` questions must
  not. Invalid items are rejected by schema validation.
- The 5-round cap is enforced **server-side**: once `rounds.length >= 5`, the route returns
  `cap_reached` (with justification) instead of more `questions`, unless
  `overrideCapApproved` is `true`, in which case one additional round is allowed. Each extra
  round beyond the cap requires its own explicit approval.

## State & persistence

Extend the existing `Draft` type (autosaved to localStorage by `lib/draft/autosave.ts`):

```ts
type Draft = {
  // ...existing fields (title, description, acceptanceCriteria, constraints, taskType, diagrams, chatHistory)
  mode: "single" | "epic"; // default "single"
  knead?: {
    rounds: Array<{
      questions: KneadQuestion[];
      answers: Record<string, string | string[]>;
    }>;
    status: "idle" | "interviewing" | "complete";
  };
};
```

Mode position, round/question state, and captured answers survive reload exactly like the
current draft. Existing drafts without these fields default to `mode: "single"` and no
`knead` block (backward compatible).

## UI flow

1. **Mode switch:** header `Single task / Epic` segmented control. Selecting **Epic**
   leaves the left-pane entry form unchanged but relabels the primary button from
   "Finalize task" to **Knead tasks**. Selecting **Single task** restores current behavior.
2. **Start kneading:** **Knead tasks** → `POST /api/knead` for round 1. The right pane
   renders the returned round as a form, grouped **Business** then **Technical**, each
   question rendered by its `type` (text field / radio group / checkbox group).
3. **Left-pane mirror:** the epic description stays on top; beneath it a read-only
   **Captured context** list shows every answered question → answer, accumulated across
   rounds. No edit affordance.
4. **Advancing a round:** the **Knead** button sits at the bottom of the round and is
   enabled only when **all** questions in the round are answered. Pressing it `POST`s the
   full answer set and either renders the next round, lands on `complete`, or shows the
   `cap_reached` yes/no prompt (with the AI's justification). Approving re-POSTs with
   `overrideCapApproved: true`.
5. **Kneading complete:** the right pane shows the full assembled context (epic + all Q&A)
   and a **disabled "Generate sub-tasks"** button with a hint that it arrives in SP2. This
   assembled context object is the handoff SP2 will consume.
6. **Lost-dough warning:** editing the epic description after at least one answered round
   re-enables **Knead tasks** and shows a `warning`-styled message that the current dough
   (questions + answers — the only dough that exists in SP1) will be lost, with a single
   yes/no checkbox **"Keep already-answered questions for the next run."** There is no
   per-question selection. Choosing to keep seeds the next run's first request with the
   prior answers; choosing not to discards them.

## Edge cases

- All questions in a round must be answered before **Knead** enables (all required).
- AI returns more than 25 questions → server truncates to 25.
- `/api/knead` request fails → inline error with a retry action; the draft (and any
  answered rounds) is preserved.
- The 5-round cap is enforced server-side; the loop only exceeds it via an explicit
  `overrideCapApproved` for one additional round at a time.
- Switching back to **Single task** mode does not destroy the kneading state in the draft;
  switching back to **Epic** restores it. (Editing the epic description still triggers the
  lost-dough rule.)

## Testing

- **Vitest (unit):**
  - `lib/knead` JSON parsing/validation: tolerant extraction, `type`/`options` consistency,
    25-question truncation, and the 5-round cap / override logic.
  - The epic-mode draft reducer: mode toggling, appending rounds/answers, lost-dough
    reset with and without keep-prior-answers, backward-compatible defaults for old drafts.
- **Playwright (e2e):**
  - Toggle **Epic** → **Knead tasks** → answer a mixed-type round (text + single + multi)
    → advance → reach **Kneading complete**.
  - Edit the epic description mid-interview → lost-dough warning appears → exercise both
    branches of the persist checkbox.
  - Add a deterministic **test mode for `/api/knead`** (mirroring the existing
    `app/api/test/` session helper) so e2e runs against canned rounds, not a live model.
