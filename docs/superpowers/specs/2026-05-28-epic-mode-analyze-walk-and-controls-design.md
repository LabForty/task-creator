# Epic Mode — Analyze walk, forced kneading, Clear + Back controls

**Ticket:** AI-36 (Add Epic Mode To Task Creator)
**Date:** 2026-05-28
**Status:** Approved design, ready for implementation plan
**Supersedes:** the silent batch `Analyze all` from the tabbed-editor refactor (`docs/superpowers/specs/2026-05-27-epic-mode-tabbed-editor-design.md`). Reuses SP1 kneading + Help / EditReviewSheet from the single-task pipeline.

## Description

Three corrections to the just-shipped tabbed editor:

1. **Forced kneading interview.** The kneading skill is allowed to return `complete` on the first call, so a moderately-detailed epic skips the interview entirely. Guarantee at least one round of questions on the first call — at both the skill and the route boundary.
2. **Analyze-all as Help walk.** Replace the silent batch `Analyze all` with a per-task Help-style chat on the right. Each tab gets its own thread; **Analyze all** walks the tasks in order, opening Help on each in turn. Edits land as `ProposedEdit` cards reviewed through the existing `EditReviewSheet`.
3. **Clear + Back controls.** A `Clear` button in the Editor footer wipes the visible draft only (not the surrounding epic structure). A `← Back` button in each epic phase steps back one phase: Reviewer → Tabs, Tabs → Kneading (clears tasks), Kneading → Editor (discards rounds).

## Decisions

1. **Skill + route both enforce ≥1 kneading round.** Skill rule covers the production model; route guard catches stub drift and any future skill regression.
2. **Per-task Help threads, propose-for-review edits.** Reuse `HelpPanel` and `/api/help` unchanged; vary only the `draft` it's pointed at (per-task namespace) and where the thread is stored.
3. **Walk is sequential, opt-out at any point.** `Analyze all` opens the chat on task 1; `Next task` / `Stop walk` controls advance or exit. A per-tab `Analyze this task` opens the same panel without entering walk mode.
4. **Clear is current-draft only.** Wipes title/description/AC/constraints/taskType for the visible namespace. Does not touch knead, `epicTasks`, reviews, interference, or other tabs' drafts.
5. **Back is phase-by-phase, never mode-by-mode.** The header `Single | Epic` segmented control still flips modes whenever it's visible.

## Architecture

### Kneading guard

Skill (`skills/task-knead/SKILL.md`): add the rule *"Always ask at least one round of questions before returning `complete`. Even a clearly-scoped epic benefits from a short scoping pass; on the first round prefer 3–6 high-signal questions covering surfaces, users, success criteria, and the biggest technical risk."*

Route guard (`app/api/knead/route.ts` via `lib/agent/runKnead`):
- If `rounds.length === 0` and the model returns `{ kind: "complete" }`, the agent retries once with a `mustAskFirstRound: true` flag passed in the user JSON (skill ignores `mustAskFirstRound` when not present; honors it as "you MUST emit a `questions` block this turn").
- If the retry also returns `complete`, the route falls back to a deterministic one-round of three questions (`q-surfaces`, `q-users`, `q-success`) so the user is never stranded with no UI. Logged as a warning server-side.

### Per-task Help walk

State added to `StandaloneApp`:

```ts
const [analyzeChatById, setAnalyzeChatById] = useState<Record<string, HelpMessage[]>>({});
const [analyzeTaskId, setAnalyzeTaskId] = useState<string | null>(null);
const [walking, setWalking] = useState(false);
```

The right-pane chat for the epic itself (single-mode Help and Epic-tab Help) keeps using the existing `chatHistory`/`updateChatHistory` plumbing. The per-task chat threads live in `analyzeChatById`, persisted into each per-task draft's `chatHistory` field via `saveDraft(epicTaskNamespace(id), { …, chatHistory })`. Reading on mount: hydrate `analyzeChatById` from each per-task draft.

Panel selection (mutually exclusive — only one right-side pane at a time):

| Condition | Right pane |
|---|---|
| `helpOpen != null` | existing `HelpPanel` against `standalone` draft |
| `analyzeTaskId != null` | `HelpPanel` against `standalone:epic:<analyzeTaskId>` draft (with walk header if `walking`) |
| KneadingPanel-eligible | `KneadingPanel` |
| none | none |

`HelpPanel` is unchanged in shape — it already takes `draft`, `history`, `onUpdateHistory`, `pendingEditCount`, `onOpenReview`, `onClose`. We add an **optional** `walkInfo?: { index: number; total: number; onNext: () => void; onStop: () => void }` prop. When present, the header shows a `Walk N/M` chip and `Next task` + `Stop walk` buttons next to **Close**.

The `task:apply-edit` event already drives the active Editor's controlled draft. Because `EpicTaskEditor` only mounts the active tab's Editor, dispatching the event while the walk is on task X (and the active tab is X) lands the edit on the correct per-task draft. The walk handler enforces this: switching `analyzeTaskId` also switches `activeTab`.

Walk control flow (handler `startAnalyzeWalk()`):
1. `walking = true`; `analyzeTaskId = epicTasks[0].id`; `activeTab = epicTasks[0].id`.
2. `HelpPanel` auto-scans the per-task draft (existing behavior on empty history).
3. **Next task** → advance to `epicTasks[i+1]`, switch tab + `analyzeTaskId`, panel auto-scans the new draft.
4. **Stop walk** → `walking = false`, `analyzeTaskId = null`, panel closes. Threads stay in `analyzeChatById`.
5. After the last task, **Next task** is disabled; **Close** acts as **Stop walk**.

Per-tab `Analyze this task` button (rendered inside `EpicTaskEditor`'s header strip, next to the task's labels/dependencies controls) just sets `analyzeTaskId = taskId` without setting `walking`; the panel opens against that task only.

Re-knead, delete-task, generate-subtasks all prune `analyzeChatById` entries for tasks that no longer exist.

### Clear + Back

`ClearDraftButton.tsx` (new, in `components/`): a small confirm-on-click button. Props: `{ onConfirm: () => void; label?: string }`. Renders **Clear** → on click swaps to inline `Clear?` `Yes` `No`. The Editor footer renders one bound to `clearVisibleDraft()` next to **Help**.

`StandaloneApp.clearVisibleDraft()`:
- Single mode → reset the `standalone` draft to `EMPTY_DRAFT` (preserving `mode`, `knead`, `epicTasks`, `reviewing`, `reviews`, `chatHistory`).
- Epic mode + Epic tab → same as single (operates on `standalone`).
- Epic mode + sub-task tab → reset `standalone:epic:<id>` to `EMPTY_DRAFT`; the descriptor's `title` mirror also clears via `setTitle(epicTasks, id, "")` + persist.

`BackBar.tsx` (new, in `components/epic/`): renders a single `← Back` button with an optional confirm message. Props: `{ label: string; confirmMessage?: string; onBack: () => void }`. When `confirmMessage` is set, click opens a small confirm popover before firing `onBack`.

`BackBar` is mounted at the top of:
- `KneadingPanel`'s left-pane companion (in `StandaloneApp` it's actually a header above the Editor when knead status is active) → `← Back to editor` with confirm *"Discard kneading rounds?"* → calls `resetDough` + sets `epicTasks=[]` (already empty here) + closes the panel.
- `EpicTabs` toolbar → `← Back to kneading` with confirm *"This will clear the current sub-tasks and per-task drafts."* → reuses the `confirmReKnead(false)`-equivalent: clears `epicTasks`, clears each per-task draft, prunes `analyzeChatById`, resets `knead` to the `interviewing` state seeded from the last round (no API call — user is back at the question form).
- Reviewer mode → relabel the existing **Edit tasks** button to **← Back to tabs** (no confirm — non-destructive). No new component.

### File touches

- Skill: `skills/task-knead/SKILL.md`
- Agent + stub: `lib/agent/index.ts` (route guard + retry), `lib/api/schemas.ts` (add `mustAskFirstRound?: boolean` and the fallback questions constant lives in `lib/knead/types.ts` so route + agent share it)
- Route: `app/api/knead/route.ts` (uses guard from agent)
- App state: `components/StandaloneApp.tsx`
- New components: `components/ClearDraftButton.tsx`, `components/epic/BackBar.tsx`
- HelpPanel walk-header prop: `components/HelpPanel.tsx`
- Editor footer: `components/Editor.tsx` (adds Clear button between Help and Knead/Finalize)
- EpicTabs: `components/epic/EpicTabs.tsx` (replace lone "Analyze all" button with toolbar of `Analyze all` + per-tab `Analyze this task`)
- Draft hydration: `lib/draft/autosave.ts` already has `chatHistory` per draft — no shape change needed.

## Acceptance criteria

### Forced kneading
- `POST /api/knead` with `rounds: []` and a model that wants to return `complete` returns a `questions` block instead (either via the retry, or the deterministic fallback). Test covers both branches.
- The first round always contains ≥1 question covering business context and ≥1 covering technical context (or the deterministic fallback if the model misbehaves twice).
- The UI shows `KneadingPanel` with the first round's questions, the `Skip` / custom-input affordances, and a working **Knead** advance button.

### Analyze walk
- Each tab has an **Analyze this task** action that opens a Help-style chat on the right pointed at that task's draft. Auto-scan runs once per session per task (mirrors existing Help behavior). Threads persist via the per-task draft's `chatHistory` and survive reload.
- **Analyze all** starts a sequential walk: switches to task 1, opens its chat, then advances on `Next task` until the last task, where `Next task` is disabled and `Close` / `Stop walk` exits.
- During a walk, the chat header shows `Walk N/M` and `Next task` + `Stop walk` controls.
- `ProposedEdit` cards from `/api/help` apply to the visible (i.e., per-task) draft via the existing `EditReviewSheet`. Applying does not advance the walk — the user clicks `Next task` when ready.
- Deleting a task removes its `analyzeChatById` entry. Re-kneading clears all entries.
- The kneading panel and the analyze panel cannot both be open at once — the gates are mutually exclusive (kneading panel only shows when `epicTasks.length === 0`).

### Clear + Back
- The Editor footer shows **Clear** next to **Help** in both single and epic modes. Clicking it inline-confirms; confirming wipes only the visible namespace's draft (`title`, `description`, `acceptanceCriteria`, `constraints`, `taskType`) and persists. Knead state, `epicTasks`, reviews, and other tabs' drafts are untouched.
- Clearing a sub-task tab also blanks that task's tab label (renders `(untitled)`).
- A `← Back` button appears at the top of the Kneading view, the Tabs view, and the Reviewer view.
- Reviewer `← Back to tabs` returns to the tab grid without confirm (replaces the current **Edit tasks** button).
- Tabs `← Back to kneading` confirms then clears `epicTasks` + per-task drafts + interference + reviews and returns to the interview form (reusing existing re-knead logic).
- Kneading `← Back to editor` confirms then resets `knead` to `idle` and returns to the Editor with the epic description intact.

### Testing
- Unit: `runKnead` retry + fallback paths; `clearVisibleDraft` for each namespace; `BackBar` confirm flow.
- Component: `HelpPanel` walk-header rendering + `Next task` / `Stop walk` callbacks; `ClearDraftButton` inline confirm; `EpicTabs` per-tab Analyze button and walk dispatch.
- Integration: StandaloneApp walk advances tab + panel + per-task draft on Next; deleting the active walk task selects a neighbor and continues.
- e2e: skipped per project decision.

## Out of scope (later)
- A "Re-analyze all" pass that ignores existing threads.
- Cross-task analysis that proposes edits to multiple tasks at once (out — single-task scope per chat thread).
- Diagrams / Finalize / Jira upload (Phase 4 / SP4).

## Edge cases
- Walk on zero tasks is a no-op (button disabled when `epicTasks.length === 0`).
- A user clicks **Analyze this task** while a walk is in progress → that explicit pick wins (`analyzeTaskId = taskId`, `walking = false`); the walk silently ends.
- The active tab changes during a walk by tab-bar click → walk follows: `analyzeTaskId = activeTab`; walk position advances/rewinds to wherever the user jumped.
- Closing the panel during a walk = `Stop walk` (already covered).
- Per-task draft `chatHistory` from a previous session is preserved on reload; the per-task panel renders existing history instead of re-scanning.
- Clearing the Epic tab does not retroactively undo the knead rounds (those are explicit `← Back to editor` territory).
- The kneading retry loop runs at most once per request to bound latency.
