# Epic Mode — Post-knead Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the top-tab editing surface with a 3-column (editor · cards · HelpPanel) layout, and replace reviewer mode with a Bake view that eagerly finalizes every sub-task and exposes the full single-task Preview surface per sub-task. Delete reviewer-mode + interference code entirely.

**Architecture:** Three sequential phases, each leaves the app in a working state. **A** removes the reviewer + interference code (epic mode falls back to "no bake target" until B/C land). **B** adds the new editing view (cards + 3-column layout). **C** adds the Bake action, Bake view, and amends the upload orchestrator to skip finalize when payloads are cached.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript 5.6 · Vitest 4.1 (jsdom 25) · Tailwind 3.4 (HIG tokens) · Anthropic Claude Agent SDK · existing SSE job stream + Jira export routes.

**Test runner:** `npx vitest run <pattern>`. Typecheck: `npx tsc --noEmit`. Lint: `npx eslint . --ext .ts,.tsx`.

**Per-task hygiene:** targeted `git add` only; NEVER stage `prompts/types/*` (template-sync drift). Commit trailer required: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`. No `git push` during this plan.

**"No empty space" layout constraint:** the editor pane uses `flex-1 min-w-0` outside but caps its INNER form at `max-w-3xl mx-auto`. The cards column uses `flex-[0.5] min-w-[280px] max-w-[420px]` when analyze is closed (it expands to fill), and `w-[300px] shrink-0` when analyze is open. The analyze HelpPanel column uses `w-[400px] shrink-0`. This keeps the editor at a comfortable reading width and lets the cards column eat any extra horizontal space.

---

## File Map

**Created:**
- `lib/epic/bake.ts` — `runBakeAll` orchestrator.
- `tests/lib/bake.test.ts`
- `components/epic/EpicTaskCard.tsx`
- `components/epic/EpicTaskCards.tsx`
- `components/epic/EpicEditingView.tsx`
- `components/epic/TaskGraph.tsx` — moved from `components/epic/review/TaskGraph.tsx`.
- `components/epic/bake/BakeNav.tsx`
- `components/epic/bake/BakeTaskPreview.tsx`
- `components/epic/bake/BakeView.tsx`
- Tests for each (`tests/components/epic/EpicTaskCard.test.tsx`, etc.)

**Modified:**
- `components/StandaloneApp.tsx` — large rewrite of review/bake/render-gate; new bake state + handlers; updated upload-tasks builder.
- `components/epic/EpicTaskEditor.tsx` — strip the top header (Analyze/Delete buttons); drop the `onAnalyze`/`onDelete` props.
- `lib/upload/types.ts` — extend `UploadTask` with `finalizedPayload?` + `diagrams?`.
- `lib/upload/orchestrator.ts` — skip `finalizeOne` when payload is cached; pass `diagrams` to export.
- `lib/draft/autosave.ts` — drop `reviewing` + `reviews` fields from `Draft`.
- `lib/agent/index.ts` — drop `runInterferenceAnalysis` + the `interference` stub branch.
- `tests/lib/agent.test.ts` — drop interference tests.

**Deleted:**
- `components/epic/EpicTabs.tsx` + test
- `components/epic/review/ReviewerMode.tsx` + test
- `components/epic/review/ReviewNav.tsx` + test
- `components/epic/review/ReviewTaskPanel.tsx` + test
- `components/epic/review/ReviewControls.tsx` + test
- `components/epic/review/EpicPreview.tsx` + test
- `components/epic/review/TaskGraph.tsx` + test (moved to `components/epic/TaskGraph.tsx`)
- `lib/review/state.ts` + test
- `lib/review/types.ts`
- `lib/interference/parse.ts` + test
- `app/api/interference/route.ts` + test
- `skills/task-interference/SKILL.md`
- `lib/api/schemas.ts` — drop `InterferenceBodySchema` + `SubTaskSchema`.

---

# Phase A — Cleanup (Tasks 1–7)

## Task 1: Delete interference route + skill + parse + types

**Files:**
- Delete: `app/api/interference/route.ts`
- Delete: `lib/interference/parse.ts`
- Delete: `tests/lib/interference-parse.test.ts` (if it exists; verify with `Glob`)
- Delete: `skills/task-interference/SKILL.md`
- Modify: `lib/api/schemas.ts` — remove `InterferenceBodySchema` + `SubTaskSchema`.

- [ ] **Step 1: Confirm consumer surface**

Run `grep -rn "InterferenceBodySchema\|interferenceTimer\|scheduleInterference\|parseInterferenceResponse\|runInterferenceAnalysis" --include="*.ts" --include="*.tsx"` to enumerate everything that needs to change in this phase. Expect hits in: `lib/agent/index.ts`, `components/StandaloneApp.tsx`, `lib/upload/...` (no), `lib/review/...` (yes — review state references InterferenceMap), `tests/lib/...`. Make a mental map.

- [ ] **Step 2: Delete the route file**

```bash
git rm app/api/interference/route.ts
```

- [ ] **Step 3: Delete the parse module + its test**

```bash
git rm lib/interference/parse.ts
ls tests/lib/interference-parse.test.ts 2>&1 && git rm tests/lib/interference-parse.test.ts
```

(If the test file doesn't exist, skip the second `rm`.)

- [ ] **Step 4: Delete the skill**

```bash
git rm skills/task-interference/SKILL.md
# Remove the now-empty directory if git allows
rmdir skills/task-interference 2>&1 || true
```

- [ ] **Step 5: Remove schemas**

Open `lib/api/schemas.ts`. Find the block (around lines 84–98):

```ts
const SubTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  labels: z.array(z.string()),
  blocks: z.array(z.string()),
  blockedBy: z.array(z.string()),
});

export const InterferenceBodySchema = z.object({
  epicDescription: z.string().min(1),
  editedSubtask: SubTaskSchema,
  allSubtasks: z.array(SubTaskSchema),
});
export type InterferenceBody = z.infer<typeof InterferenceBodySchema>;
```

Delete the entire block. Save.

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit
```

Expected: errors in `lib/agent/index.ts` (uses `runInterferenceAnalysis` + `parseInterferenceResponse`), `components/StandaloneApp.tsx` (uses `scheduleInterference`, `interference` state, `setInterference`), test files that exercise interference. **These are expected** — Tasks 2 and 6 fix them.

- [ ] **Step 7: Commit**

```bash
git add app/api/interference lib/interference skills/task-interference lib/api/schemas.ts
git commit -m "chore(AI-36): delete interference route + skill + parse + schemas

Step 1 of post-knead overhaul cleanup. The interference analysis
feature is being removed as part of the reviewer-mode removal.
Subsequent tasks remove the consumers (agent, StandaloneApp).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Remove interference from agent + stub + tests

**Files:**
- Modify: `lib/agent/index.ts`
- Modify: `tests/lib/agent.test.ts` (drop any interference test block)
- Modify: `tests/lib/agent-interference.test.ts` if it exists → delete

- [ ] **Step 1: Find interference references in agent**

Read `lib/agent/index.ts` and locate:
1. The `import { parseInterferenceResponse } from "@/lib/interference/parse";` line.
2. The `runInterferenceAnalysis` export (around lines 445–478).
3. The `else if (role === "interference")` branch in `makeStubTransport` (around lines 623–632).

- [ ] **Step 2: Delete those three locations**

In `lib/agent/index.ts`:
- Remove the `parseInterferenceResponse` import line.
- Remove the entire `export async function runInterferenceAnalysis(...) { ... }` function (~33 lines).
- Remove the `else if (role === "interference") { ... }` branch in the stub transport (~10 lines including the inline `try`).
- Remove `import type { InterferenceWarning } from "@/lib/review/types";` (the one place the type was used was inside `runInterferenceAnalysis`).
- Remove the `import type { SubTask } from "@/lib/subtasks/types";` line if it has NO other use (verify with grep; it's also used by `runInterferenceAnalysis` and possibly nothing else now).

- [ ] **Step 3: Delete interference tests**

```bash
ls tests/lib/agent-interference.test.ts 2>&1 && git rm tests/lib/agent-interference.test.ts
```

If `tests/lib/agent.test.ts` has any `describe("runInterferenceAnalysis", ...)` block, delete it inline. Read the file to verify.

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: still errors in `components/StandaloneApp.tsx` referencing `interference`, `setInterference`, `scheduleInterference`, etc. These resolve in Task 6.

- [ ] **Step 5: Verify the existing tests not related to interference still pass**

```bash
npx vitest run tests/lib/agent.test.ts
```

Expected: PASS (without the interference cases).

- [ ] **Step 6: Commit**

```bash
git add lib/agent/index.ts tests/lib/agent.test.ts
# Add agent-interference test deletion if it existed
git status --porcelain | grep "agent-interference" >/dev/null && git add tests/lib/agent-interference.test.ts
git commit -m "chore(AI-36): drop runInterferenceAnalysis + stub branch

Remove the interference agent function and its stub transport branch.
Also drop the now-unused parseInterferenceResponse + InterferenceWarning
imports. Consumers in StandaloneApp still reference interference state
and break typecheck — Task 6 fixes that.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Delete `lib/review/*` and clean the Draft type

**Files:**
- Delete: `lib/review/state.ts`, `lib/review/types.ts`, `tests/lib/review-state.test.ts`
- Modify: `lib/draft/autosave.ts` — drop `reviewing` + `reviews` fields and the `ReviewMap` import.

- [ ] **Step 1: Delete the review lib**

```bash
git rm lib/review/state.ts lib/review/types.ts tests/lib/review-state.test.ts
rmdir lib/review 2>&1 || true
```

- [ ] **Step 2: Strip Draft type**

Open `lib/draft/autosave.ts`. Remove:

1. The import line `import type { ReviewMap } from "@/lib/review/types";`
2. The two fields from the `Draft` type:

```ts
  reviewing?: boolean;
  reviews?: ReviewMap;
```

3. The two hydration lines from `loadDraft`:

```ts
      reviewing: parsed.reviewing === true ? true : undefined,
      reviews: parsed.reviews && typeof parsed.reviews === "object" ? parsed.reviews : undefined,
```

Save. The other `Draft` fields are unchanged.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: errors in `components/StandaloneApp.tsx` (consumes `reviewing`/`reviews` from loadDraft + sets them in saveDraft preserve-lists). Fixes in Task 6. Errors in test files that touch `reviewing`/`reviews` — fix inline as part of Task 6.

- [ ] **Step 4: Commit**

```bash
git add lib/draft/autosave.ts lib/review tests/lib/review-state.test.ts
git commit -m "chore(AI-36): drop lib/review and Draft.reviewing/reviews fields

Old persisted drafts that contain these fields hydrate cleanly because
loadDraft now just ignores extra keys (Partial<Draft> spread). StandaloneApp
still references reviewing/reviews — Task 6 removes those consumers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Delete reviewer-mode components

**Files:** Delete all of `components/epic/review/*` EXCEPT TaskGraph (Task 5 moves it):

- `components/epic/review/ReviewerMode.tsx`
- `components/epic/review/ReviewNav.tsx`
- `components/epic/review/ReviewTaskPanel.tsx`
- `components/epic/review/ReviewControls.tsx`
- `components/epic/review/EpicPreview.tsx`
- Their corresponding test files in `tests/components/epic/review/`

- [ ] **Step 1: Enumerate the deletes**

```bash
ls components/epic/review/
ls tests/components/epic/review/
```

- [ ] **Step 2: git rm each one (except TaskGraph)**

```bash
git rm components/epic/review/ReviewerMode.tsx \
       components/epic/review/ReviewNav.tsx \
       components/epic/review/ReviewTaskPanel.tsx \
       components/epic/review/ReviewControls.tsx \
       components/epic/review/EpicPreview.tsx
# Delete the corresponding test files (only those that exist)
for f in tests/components/epic/review/ReviewerMode.test.tsx \
         tests/components/epic/review/ReviewNav.test.tsx \
         tests/components/epic/review/ReviewTaskPanel.test.tsx \
         tests/components/epic/review/ReviewControls.test.tsx \
         tests/components/epic/review/EpicPreview.test.tsx; do
  [ -f "$f" ] && git rm "$f"
done
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: errors in `components/StandaloneApp.tsx` referencing `ReviewerMode` import. Fixes in Task 6.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(AI-36): delete reviewer-mode components

Removes ReviewerMode, ReviewNav, ReviewTaskPanel, ReviewControls, and
EpicPreview. TaskGraph stays (moves in Task 5). StandaloneApp still
imports ReviewerMode — Task 6 fixes that.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Move TaskGraph out of `/review/`

**Files:**
- Rename: `components/epic/review/TaskGraph.tsx` → `components/epic/TaskGraph.tsx`
- Rename: `tests/components/epic/review/TaskGraph.test.tsx` → `tests/components/epic/TaskGraph.test.tsx`

- [ ] **Step 1: git mv**

```bash
git mv components/epic/review/TaskGraph.tsx components/epic/TaskGraph.tsx
git mv tests/components/epic/review/TaskGraph.test.tsx tests/components/epic/TaskGraph.test.tsx
```

- [ ] **Step 2: Update import in the test file**

Open `tests/components/epic/TaskGraph.test.tsx`. The import line:

```ts
import { TaskGraph } from "@/components/epic/review/TaskGraph";
```

Change to:

```ts
import { TaskGraph } from "@/components/epic/TaskGraph";
```

- [ ] **Step 3: Search for any other consumer**

```bash
grep -rn "components/epic/review/TaskGraph" --include="*.ts" --include="*.tsx"
```

Expected: zero hits (the only consumer was `ReviewerMode.tsx`, which was deleted in Task 4).

- [ ] **Step 4: Remove the empty `tests/components/epic/review/` directory if empty**

```bash
rmdir tests/components/epic/review 2>&1 || true
rmdir components/epic/review 2>&1 || true
```

- [ ] **Step 5: Run TaskGraph tests**

```bash
npx vitest run tests/components/epic/TaskGraph.test.tsx
```

Expected: PASS (3/3).

- [ ] **Step 6: Commit**

```bash
git add components/epic/TaskGraph.tsx tests/components/epic/TaskGraph.test.tsx
git commit -m "refactor(AI-36): move TaskGraph out of /review/ folder

TaskGraph is no longer specific to reviewer mode (it'll be reused in
the Bake view's Epic overview). Move to components/epic/TaskGraph.tsx
and update the test import. The /review/ directories are now empty
and removed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Strip reviewer/interference state from `StandaloneApp.tsx`

**Files:**
- Modify: `components/StandaloneApp.tsx`
- Modify: `tests/components/StandaloneApp.test.tsx` — remove any tests that depend on `reviewing`/`reviews`/`interference` state.

This is the biggest cleanup. We replace the reviewer branch with a stub (Bake button calls `void 0` for now), then Phase B + C re-add real behaviour.

- [ ] **Step 1: Remove imports**

In `components/StandaloneApp.tsx`, delete these lines (search for each):

```ts
import { ReviewerMode } from "@/components/epic/review/ReviewerMode";
import { setReview, initReviews, nonDeniedTaskIds } from "@/lib/review/state";
import type { ReviewMap, InterferenceMap, SubtaskReview } from "@/lib/review/types";
```

Replace with just:

```ts
import { nonDeniedTaskIds } from "@/lib/review/state";
```

WAIT — `lib/review/state.ts` was deleted in Task 3. The orchestrator's upload-tasks builder relies on `nonDeniedTaskIds` to filter denied tasks; but we're dropping the concept of "denied" entirely now. The upload builder will iterate `epicTasks` directly (every task ships). So drop the import too. Also drop the `denied` array in the `UploadSheet` mount — pass `denied={[]}`.

So the final imports change is: drop `ReviewerMode`, `setReview`, `initReviews`, `nonDeniedTaskIds`, `ReviewMap`, `InterferenceMap`, `SubtaskReview` entirely.

- [ ] **Step 2: Remove state declarations**

Delete these lines (around lines 107–112 in the current file):

```ts
  const [reviewing, setReviewing] = useState(false);
  const [reviews, setReviews] = useState<ReviewMap>({});
  const [interference, setInterference] = useState<InterferenceMap>({});
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
```

And the interference timer + cleanup (around lines 112–115):

```ts
  const interferenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (interferenceTimer.current) clearTimeout(interferenceTimer.current); }, []);
```

- [ ] **Step 3: Remove handlers**

Delete the following functions entirely (search for each name and delete its full body):

- `persistReview`
- `bake` (it transitions into reviewing — replaced in Phase C with `startBake`)
- `exitReview`
- `changeReview`
- `scheduleInterference`
- `reviewTitleChange`
- `reviewSetLabels`
- `reviewAddLink`
- `reviewRemoveLink`
- `reviewDelete`

Also remove the existing `startFinalize` handler and the `persistUploadedKey` handler — these run via the new Bake → Upload flow but the wiring changes substantially in Phase C. Keep the variables but remove the body and inline them in Phase C.

Actually, **keep `startFinalize` + `persistUploadedKey`** since the UploadSheet still consumes them. Their bodies stay unchanged — they don't reference reviewer state.

- [ ] **Step 4: Remove reviewer state from hydration**

In the mount useEffect (around lines 125–145), delete:

```ts
    if (d.reviewing) setReviewing(true);
    if (d.reviews) setReviews(d.reviews);
```

- [ ] **Step 5: Remove `reviews`/`interference` from `deleteTask` + `generateSubtasks` + `confirmReKnead`**

Search for each `setReviews((prev) => { const m = { ...prev }; delete m[id]; ... })` and remove it. Same for `setInterference(...)`. Same for `setReviews({})`, `setInterference({})`, `persistReview(false, {})` etc.

- [ ] **Step 6: Replace the ReviewerMode render branch with a stub**

Find the render conditional (around line 869):

```tsx
        {mode.kind === "idle" || mode.kind === "running" ? (
          epicMode && reviewing ? (
            <ReviewerMode … />
          ) : epicMode && epicTasks.length > 0 ? (
            <div className="px-6 py-4 flex-1 min-h-0 flex flex-col max-w-5xl w-full">
              <EpicTabs … />
            </div>
          ) : (
```

Change to:

```tsx
        {mode.kind === "idle" || mode.kind === "running" ? (
          epicMode && epicTasks.length > 0 ? (
            <div className="px-6 py-4 flex-1 min-h-0 flex flex-col max-w-5xl w-full">
              <EpicTabs … />
            </div>
          ) : (
```

(I.e., remove the `reviewing` outer branch entirely — Phase C adds the `bakeStatus === "baked"` branch.)

- [ ] **Step 7: Inside EpicTabs, change `onBake` to a no-op**

The EpicTabs `onBake={bake}` line — `bake` no longer exists. Change to `onBake={() => {}}` as a temporary stub. EpicTabs is also going away in Phase B/C so this is short-lived.

- [ ] **Step 8: Fix UploadSheet's task builder**

The current builder uses `nonDeniedTaskIds(reviews, ...)` + an `uploadedIssueKey` filter. With reviews gone, simplify to:

```tsx
{uploadOpen && (() => {
  const uploadTasks: UploadTask[] = epicTasks.map((t) => ({
    id: t.id,
    draft: loadDraft(epicTaskNamespace(t.id)),
    labels: t.labels,
  }));
  return (
    <UploadSheet
      tasks={uploadTasks}
      denied={[]}
      epicTitle={liveDraft?.title ?? ""}
      epicDescriptionHtml={liveDraft?.description ?? ""}
      onCancel={() => setUploadOpen(false)}
      onPersistUploaded={persistUploadedKey}
    />
  );
})()}
```

(The `denied={[]}` is a pass-through; the UploadSheet still accepts it as a prop. Phase C removes the prop entirely.)

- [ ] **Step 9: Strip review fields from saveDraft preserve sites**

Search for every `saveDraft(NAMESPACE, { ...current, ... })` call that included `reviewing: existing.reviewing` or `reviews: existing.reviews`. Remove those lines. Same for `Editor.tsx` autosave (around lines 79–93) — `mode, knead, epicTasks, reviewing, reviews, chatHistory` becomes `mode, knead, epicTasks, chatHistory`.

Open `components/Editor.tsx` and locate the two `saveDraft` calls (the `useEffect` autosave and the `flush` function). Each one looks like:

```ts
saveDraft(namespace, { ...draft, mode: existing.mode, knead: existing.knead, epicTasks: existing.epicTasks, reviewing: existing.reviewing, reviews: existing.reviews, chatHistory: existing.chatHistory });
```

Remove `reviewing: existing.reviewing, reviews: existing.reviews,` from both. The new spread is:

```ts
saveDraft(namespace, { ...draft, mode: existing.mode, knead: existing.knead, epicTasks: existing.epicTasks, chatHistory: existing.chatHistory });
```

Likewise in `StandaloneApp.tsx`'s `persistEpic`, `persistEpicTasks`, `clearVisibleDraft` — strip any `reviewing`/`reviews` fields.

- [ ] **Step 10: Run the tests**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: type errors might surface in the test files. Fix inline:
- `tests/components/StandaloneApp.test.tsx` — drop any tests that exercise `reviewing` or `reviews`. Inspect each test; remove the body or simplify if it was core flow. Likely the "Back to editor from kneading" test still works (doesn't touch reviewing). The "clicking Finalize opens the UploadSheet" test currently seeds `reviewing: true, reviews: {...}` — change the seed to use the new flow. **Defer fixing that one until Phase C** — mark it `.skip` with a comment.

  ```tsx
  it.skip("clicking Finalize opens the UploadSheet when every task is reviewed", async () => {
    // Phase C will rewrite this against the new Bake view + Upload all path.
    ...
  });
  ```

- `tests/components/epic/EpicTaskEditor.test.tsx` — should still pass; EpicTaskEditor hasn't changed yet.

- [ ] **Step 11: Commit**

```bash
git add components/StandaloneApp.tsx components/Editor.tsx tests/components/StandaloneApp.test.tsx
git commit -m "chore(AI-36): strip reviewer + interference state from StandaloneApp

- Drop reviewing/reviews/interference/selectedReviewId state + handlers
  (bake, exitReview, changeReview, scheduleInterference, review*).
- Editor + draft preserve sites no longer mirror reviewing/reviews.
- ReviewerMode render branch replaced by a placeholder so the EpicTabs
  surface stays usable while Phase B/C land.
- UploadSheet task builder no longer filters by denied (every task ships).
- One StandaloneApp test that depended on the old reviewing seed is
  .skip'd with a Phase-C-will-rewrite comment.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Phase A verification

**Files:** none

- [ ] **Step 1: Full test suite**

```bash
npx vitest run
```

Expected: green except the Phase-C-skipped test.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: TYPECHECK_OK.

- [ ] **Step 3: Lint**

```bash
npx eslint . --ext .ts,.tsx
```

Expected: clean.

- [ ] **Step 4: Smoke the dev server**

```bash
pnpm dev
```

Test path: switch to Epic mode, knead, generate sub-tasks. Confirm EpicTabs still works (top tab bar) and that Bake does nothing (it's stubbed). No console errors.

No commit needed.

---

# Phase B — Editing surface (Tasks 8–13)

## Task 8: `EpicTaskCard` component

**Files:**
- Create: `components/epic/EpicTaskCard.tsx`
- Create: `tests/components/epic/EpicTaskCard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/epic/EpicTaskCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EpicTaskCard } from "@/components/epic/EpicTaskCard";

describe("<EpicTaskCard>", () => {
  it("renders title and description preview", () => {
    render(
      <EpicTaskCard
        kind="task"
        title="Alpha"
        descriptionPreview="A short description."
        active={false}
        onSelect={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText(/short description/i)).toBeInTheDocument();
  });

  it("fires onSelect when the card body is clicked", async () => {
    const onSelect = vi.fn();
    render(
      <EpicTaskCard
        kind="task"
        title="A"
        descriptionPreview=""
        active={false}
        onSelect={onSelect}
        onDelete={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /A.*open task/i }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("inline-confirms delete and fires onDelete only after Yes", async () => {
    const onDelete = vi.fn();
    render(
      <EpicTaskCard
        kind="task"
        title="A"
        descriptionPreview=""
        active={false}
        onSelect={() => {}}
        onDelete={onDelete}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /delete task/i }));
    expect(screen.getByText(/delete\?/i)).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /^yes$/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("does not render delete on the Epic card", () => {
    render(
      <EpicTaskCard
        kind="epic"
        title="My Epic"
        descriptionPreview=""
        active={true}
        onSelect={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: /delete task/i })).toBeNull();
  });

  it("shows bake state chip when set", () => {
    render(
      <EpicTaskCard
        kind="task"
        title="A"
        descriptionPreview=""
        active={false}
        bakeState="baking"
        onSelect={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText(/baking/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/components/epic/EpicTaskCard.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `components/epic/EpicTaskCard.tsx`:

```tsx
"use client";

import { useState } from "react";

type BakeState = "pending" | "baking" | "baked" | "failed";

type Props = {
  kind: "epic" | "task";
  title: string;
  descriptionPreview: string;
  labelsCount?: number;
  linksCount?: number;
  active: boolean;
  bakeState?: BakeState;
  bakeError?: string;
  onSelect: () => void;
  onDelete?: () => void;          // omitted/ignored for kind="epic"
};

function bakeChipLabel(s: BakeState): string {
  switch (s) {
    case "pending": return "pending";
    case "baking": return "baking…";
    case "baked": return "baked ✓";
    case "failed": return "failed";
  }
}

function bakeChipClass(s: BakeState): string {
  switch (s) {
    case "pending": return "bg-slate-200 text-slate-700";
    case "baking": return "bg-accent-tint text-accent";
    case "baked": return "bg-success/10 text-success";
    case "failed": return "bg-danger/10 text-danger";
  }
}

export function EpicTaskCard({
  kind, title, descriptionPreview, labelsCount, linksCount, active,
  bakeState, bakeError, onSelect, onDelete,
}: Props) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div
      className={
        "group relative rounded-md border bg-surface px-3 py-2.5 transition-colors " +
        (active ? "border-accent ring-1 ring-accent/30" : "border-rule hover:border-rule-strong")
      }
    >
      <button
        type="button"
        onClick={onSelect}
        aria-label={`${title || "(untitled)"} — open ${kind === "epic" ? "epic" : "task"}`}
        className="block w-full text-left"
      >
        <div className="flex items-baseline gap-2 mb-0.5">
          {kind === "epic" && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-tertiary shrink-0">Epic</span>
          )}
          <span className="text-hig-subhead font-medium text-ink truncate flex-1">{title || "(untitled)"}</span>
        </div>
        {descriptionPreview && (
          <p className="text-hig-footnote text-ink-secondary line-clamp-2">{descriptionPreview}</p>
        )}
        {kind === "task" && ((labelsCount ?? 0) > 0 || (linksCount ?? 0) > 0 || bakeState) && (
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {(labelsCount ?? 0) > 0 && (
              <span className="text-[10px] text-ink-tertiary">{labelsCount} label{labelsCount === 1 ? "" : "s"}</span>
            )}
            {(linksCount ?? 0) > 0 && (
              <span className="text-[10px] text-ink-tertiary">{linksCount} link{linksCount === 1 ? "" : "s"}</span>
            )}
            {bakeState && (
              <span
                title={bakeError}
                className={"inline-flex items-center px-1.5 rounded-sm text-[10px] font-medium " + bakeChipClass(bakeState)}
              >
                {bakeChipLabel(bakeState)}
              </span>
            )}
          </div>
        )}
      </button>

      {kind === "task" && onDelete && !confirming && (
        <button
          type="button"
          aria-label="Delete task"
          onClick={() => setConfirming(true)}
          className="absolute top-1 right-1 w-6 h-6 inline-flex items-center justify-center rounded text-ink-tertiary hover:text-danger hover:bg-danger/10 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        >
          ×
        </button>
      )}
      {confirming && onDelete && (
        <div className="absolute inset-0 bg-surface/95 rounded-md flex items-center justify-center gap-2 p-2">
          <span className="text-hig-footnote text-ink">Delete?</span>
          <button
            type="button"
            onClick={() => { setConfirming(false); onDelete(); }}
            className="px-2 py-0.5 rounded-sm text-hig-footnote bg-danger text-white hover:bg-danger/90"
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="px-2 py-0.5 rounded-sm text-hig-footnote bg-surface-muted text-ink hover:bg-surface-strong"
          >
            No
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/components/epic/EpicTaskCard.test.tsx
```

Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add components/epic/EpicTaskCard.tsx tests/components/epic/EpicTaskCard.test.tsx
git commit -m "feat(AI-36): EpicTaskCard component for the editing-view card grid

Single card showing kind/title/description preview/counts/active state
with an inline-confirm × delete (hidden by default, visible on hover).
The Epic variant has no delete affordance. Optional bakeState chip
shows the per-card bake progress (pending/baking/baked/failed).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: `EpicTaskCards` component (card grid + Add tile + progress strip)

**Files:**
- Create: `components/epic/EpicTaskCards.tsx`
- Create: `tests/components/epic/EpicTaskCards.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/epic/EpicTaskCards.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EpicTaskCards } from "@/components/epic/EpicTaskCards";

describe("<EpicTaskCards>", () => {
  it("renders Epic + one task + Add tile", () => {
    render(
      <EpicTaskCards
        epicTitle="My Epic"
        epicDescriptionPreview="An epic doing things."
        tasks={[{ id: "a", title: "Alpha", labels: [], blocks: [], blockedBy: [] }]}
        activeId="epic"
        bakeStatus="idle"
        onSelect={() => {}}
        onAdd={() => {}}
        onDelete={() => {}}
        onCancelBake={() => {}}
      />,
    );
    expect(screen.getByText("My Epic")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add task/i })).toBeInTheDocument();
  });

  it("shows the bake progress strip when baking", () => {
    render(
      <EpicTaskCards
        epicTitle=""
        epicDescriptionPreview=""
        tasks={[
          { id: "a", title: "Alpha", labels: [], blocks: [], blockedBy: [] },
          { id: "b", title: "Beta", labels: [], blocks: [], blockedBy: [] },
        ]}
        activeId="a"
        bakeStatus="baking"
        bakeTotal={2}
        bakeDone={1}
        bakeProgress={{ a: "baked", b: "baking" }}
        onSelect={() => {}}
        onAdd={() => {}}
        onDelete={() => {}}
        onCancelBake={() => {}}
      />,
    );
    expect(screen.getByText(/baking 1\/2/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
  });

  it("disables Add tile while baking", () => {
    render(
      <EpicTaskCards
        epicTitle=""
        epicDescriptionPreview=""
        tasks={[]}
        activeId="epic"
        bakeStatus="baking"
        bakeTotal={0}
        bakeDone={0}
        bakeProgress={{}}
        onSelect={() => {}}
        onAdd={() => {}}
        onDelete={() => {}}
        onCancelBake={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /add task/i })).toBeDisabled();
  });

  it("Cancel during bake fires onCancelBake", async () => {
    const onCancelBake = vi.fn();
    render(
      <EpicTaskCards
        epicTitle=""
        epicDescriptionPreview=""
        tasks={[{ id: "a", title: "A", labels: [], blocks: [], blockedBy: [] }]}
        activeId="a"
        bakeStatus="baking"
        bakeTotal={1}
        bakeDone={0}
        bakeProgress={{ a: "baking" }}
        onSelect={() => {}}
        onAdd={() => {}}
        onDelete={() => {}}
        onCancelBake={onCancelBake}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onCancelBake).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/components/epic/EpicTaskCards.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `components/epic/EpicTaskCards.tsx`:

```tsx
"use client";

import { EpicTaskCard } from "@/components/epic/EpicTaskCard";
import type { EpicTask } from "@/lib/epic/tasks";

type BakeState = "pending" | "baking" | "baked" | "failed";

type Props = {
  epicTitle: string;
  epicDescriptionPreview: string;
  tasks: EpicTask[];
  activeId: "epic" | string;
  bakeStatus: "idle" | "baking" | "baked";
  bakeProgress?: Record<string, BakeState>;
  bakeErrors?: Record<string, string>;
  bakeTotal?: number;
  bakeDone?: number;
  onSelect: (id: "epic" | string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onCancelBake: () => void;
};

export function EpicTaskCards(props: Props) {
  const baking = props.bakeStatus === "baking";

  return (
    <div className="flex flex-col gap-2 h-full min-h-0 overflow-y-auto p-3">
      {baking && (
        <div className="sticky top-0 z-10 -mt-3 -mx-3 px-3 py-2 bg-surface border-b border-rule flex items-center gap-2">
          <span className="text-hig-footnote font-medium text-ink">
            Baking {props.bakeDone ?? 0}/{props.bakeTotal ?? props.tasks.length}…
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={props.onCancelBake}
            className="px-2 py-0.5 rounded-sm text-hig-footnote bg-surface-muted text-ink hover:bg-surface-strong"
          >
            Cancel
          </button>
        </div>
      )}

      <EpicTaskCard
        kind="epic"
        title={props.epicTitle || "(untitled epic)"}
        descriptionPreview={props.epicDescriptionPreview}
        active={props.activeId === "epic"}
        onSelect={() => props.onSelect("epic")}
      />

      {props.tasks.map((t) => (
        <EpicTaskCard
          key={t.id}
          kind="task"
          title={t.title}
          descriptionPreview=""
          labelsCount={t.labels.length}
          linksCount={t.blocks.length + t.blockedBy.length}
          active={props.activeId === t.id}
          bakeState={props.bakeProgress?.[t.id]}
          bakeError={props.bakeErrors?.[t.id]}
          onSelect={() => props.onSelect(t.id)}
          onDelete={() => props.onDelete(t.id)}
        />
      ))}

      <button
        type="button"
        onClick={props.onAdd}
        disabled={baking}
        aria-label="Add task"
        className="rounded-md border-2 border-dashed border-rule px-3 py-3 text-hig-footnote text-ink-tertiary hover:border-accent hover:text-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        + Add task
      </button>
    </div>
  );
}
```

Note: `descriptionPreview=""` for sub-task cards (we don't compute a preview from the per-task draft here — keeps render cheap). The `EpicTaskCard` already handles empty preview by not rendering the `<p>`. The Epic card receives a real preview from the parent.

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/components/epic/EpicTaskCards.test.tsx
```

Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add components/epic/EpicTaskCards.tsx tests/components/epic/EpicTaskCards.test.tsx
git commit -m "feat(AI-36): EpicTaskCards container with Add tile + bake progress

Vertical card stack: Epic card pinned at top, one card per sub-task,
+ Add task tile at the end (disabled while baking). Sticky progress
strip appears at the top during bake; Cancel button fires onCancelBake.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Simplify `EpicTaskEditor` (drop header strip)

**Files:**
- Modify: `components/epic/EpicTaskEditor.tsx`
- Modify: `tests/components/epic/EpicTaskEditor.test.tsx`

- [ ] **Step 1: Inspect current state**

Read `components/epic/EpicTaskEditor.tsx`. It currently has:
- `onAnalyze?: () => void` prop (now optional after the SP4 reviewer-noop fix).
- `onDelete: () => void` prop (required).
- A top header strip rendering `Analyze this task` (conditional) + `Delete task` buttons.

We're removing the header strip entirely. Delete + Analyze actions move to the cards (delete via `EpicTaskCard.×`; analyze still calls `onAnalyze` from the parent via... wait, the parent passes `onAnalyzeTask(id)` based on card-row click). For now, drop the entire `Analyze this task` and `Delete task` buttons. The parent (`EpicEditingView` in Task 11) won't pass `onDelete` or `onAnalyze`.

- [ ] **Step 2: Update Props**

```ts
type Props = {
  taskId: string;
  allTasks: EpicTask[];
  labels: string[];
  blocks: string[];
  blockedBy: string[];
  refreshKey: number;
  onTitleChange: (title: string) => void;
  onSetLabels: (labels: string[]) => void;
  onAddLink: (blockerId: string, blockedId: string) => void;
  onRemoveLink: (blockerId: string, blockedId: string) => void;
  onClear: () => void;
};
```

(Drop `onDelete` and `onAnalyze` props entirely. `onClear` stays — the Editor footer's Clear button still wires through it.)

- [ ] **Step 3: Strip the header strip**

Find the JSX block (around lines 33–43):

```tsx
      <div className="flex justify-between items-center">
        {onAnalyze ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => onAnalyze()}>
            Analyze this task
          </Button>
        ) : <span />}
        <Button type="button" variant="ghost" size="sm" aria-label="Delete task" onClick={onDelete}>
          Delete task
        </Button>
      </div>
```

Delete this block entirely. The `<div className="flex flex-col gap-4">` now starts straight with the `<Editor>` and ends with the `Dependencies & labels` card.

- [ ] **Step 4: Remove the now-unused Button import**

If `Button` is no longer used in the file (verify; LabelsEditor + SubtaskLinksField provide their own internal buttons), remove `import { Button } from "@/components/ui/Button";`.

- [ ] **Step 5: Update tests**

Open `tests/components/epic/EpicTaskEditor.test.tsx`. Remove tests that exercise the deleted `onAnalyze` / `onDelete` buttons. Keep the one that verifies `onClear` propagates to the Editor footer. Also drop `onDelete` / `onAnalyze` from the `base` props object.

The remaining tests should be:
- "forwards onClear into the embedded Editor footer"
- (Optionally) "renders the labels and dependencies card below the editor" — add this if not already present:

```tsx
it("renders the Dependencies & labels card below the editor", () => {
  render(
    <EpicTaskEditor
      taskId="t1"
      allTasks={[{ id: "t1", title: "T1", labels: [], blocks: [], blockedBy: [] }]}
      labels={[]}
      blocks={[]}
      blockedBy={[]}
      refreshKey={0}
      onTitleChange={() => {}}
      onSetLabels={() => {}}
      onAddLink={() => {}}
      onRemoveLink={() => {}}
      onClear={() => {}}
    />,
  );
  expect(screen.getByText(/dependencies & labels/i)).toBeInTheDocument();
});
```

Remove `it("renders Analyze this task ...", ...)`, `it("hides Analyze this task when onAnalyze is omitted", ...)`, and anything that asserts a Delete task button.

- [ ] **Step 6: Run tests**

```bash
npx vitest run tests/components/epic/EpicTaskEditor.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Typecheck**

```bash
npx tsc --noEmit
```

Expected: errors only in `EpicTabs.tsx` (it passes `onAnalyze` + `onDelete` to `EpicTaskEditor`). Task 12 replaces EpicTabs entirely. To unblock typecheck, comment those two lines in `EpicTabs.tsx` temporarily:

```tsx
            // onAnalyze={() => props.onAnalyzeTask(activeTask.id)}
            // onDelete={() => props.onDelete(activeTask.id)}
```

(Task 12 deletes EpicTabs.)

- [ ] **Step 8: Commit**

```bash
git add components/epic/EpicTaskEditor.tsx components/epic/EpicTabs.tsx tests/components/epic/EpicTaskEditor.test.tsx
git commit -m "refactor(AI-36): drop EpicTaskEditor header strip (Analyze/Delete)

Those actions now live on the cards (Task 8/9). EpicTaskEditor renders
only its Editor + Dependencies & labels card. Drops onAnalyze + onDelete
props. Temporarily comments the EpicTabs callers; Task 12 deletes
EpicTabs entirely.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: `EpicEditingView` component (3-column layout)

**Files:**
- Create: `components/epic/EpicEditingView.tsx`
- Create: `tests/components/epic/EpicEditingView.test.tsx`

This is the new top-level editing surface — replaces `EpicTabs`.

- [ ] **Step 1: Write the failing test**

Create `tests/components/epic/EpicEditingView.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EpicEditingView } from "@/components/epic/EpicEditingView";

const tasks = [
  { id: "a", title: "Alpha", labels: [], blocks: [], blockedBy: [] },
];

const baseProps = {
  epicTitle: "My Epic",
  epicDescriptionHtml: "<p>doing things</p>",
  tasks,
  activeId: "epic" as const,
  bakeStatus: "idle" as const,
  bakeProgress: {},
  bakeErrors: {},
  bakeDone: 0,
  bakeTotal: 0,
  refreshKey: 0,
  onSelectCard: () => {},
  onAdd: () => {},
  onDelete: () => {},
  onCancelBake: () => {},
  onBack: () => {},
  onAnalyzeAll: () => {},
  onBake: () => {},
  onTitleChange: () => {},
  onSetLabels: () => {},
  onAddLink: () => {},
  onRemoveLink: () => {},
  onClearTask: () => {},
};

beforeEach(() => {
  // Stub the templates fetch for the embedded Editor's TaskTypePicker.
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ templates: [] }),
  }) as unknown as typeof fetch;
});
afterEach(() => { vi.restoreAllMocks(); });

describe("<EpicEditingView>", () => {
  it("renders the toolbar with Back, Analyze all, and Bake", () => {
    render(<EpicEditingView {...baseProps} />);
    expect(screen.getByRole("button", { name: /back to kneading/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^analyze all$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^bake$/i })).toBeInTheDocument();
  });

  it("clicking the Bake button fires onBake", async () => {
    const onBake = vi.fn();
    render(<EpicEditingView {...baseProps} onBake={onBake} />);
    await userEvent.click(screen.getByRole("button", { name: /^bake$/i }));
    expect(onBake).toHaveBeenCalledTimes(1);
  });

  it("disables Bake while baking", () => {
    render(<EpicEditingView {...baseProps} bakeStatus="baking" />);
    expect(screen.getByRole("button", { name: /^bake$/i })).toBeDisabled();
  });

  it("renders the cards column with Epic + tasks", () => {
    render(<EpicEditingView {...baseProps} />);
    expect(screen.getByText("My Epic")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/components/epic/EpicEditingView.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `components/epic/EpicEditingView.tsx`:

```tsx
"use client";

import { Editor } from "@/components/Editor";
import { Button } from "@/components/ui/Button";
import { BackBar } from "@/components/epic/BackBar";
import { EpicTaskCards } from "@/components/epic/EpicTaskCards";
import { EpicTaskEditor } from "@/components/epic/EpicTaskEditor";
import type { EpicTask } from "@/lib/epic/tasks";

const NAMESPACE = "standalone";

type BakeState = "pending" | "baking" | "baked" | "failed";

type Props = {
  // Epic identity for the Epic card
  epicTitle: string;
  epicDescriptionHtml: string;
  tasks: EpicTask[];
  activeId: "epic" | string;
  refreshKey: number;
  // Bake state passed through to the cards
  bakeStatus: "idle" | "baking" | "baked";
  bakeProgress: Record<string, BakeState>;
  bakeErrors: Record<string, string>;
  bakeDone: number;
  bakeTotal: number;
  // Whether the third (HelpPanel) column is present — the parent renders the
  // HelpPanel itself; this prop only lets us narrow the cards column when
  // analyze is open. Parent passes true iff analyzeTaskId is set.
  analyzePanelOpen?: boolean;
  // Card handlers
  onSelectCard: (id: "epic" | string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onCancelBake: () => void;
  // Toolbar handlers
  onBack: () => void;
  onAnalyzeAll: () => void;
  onBake: () => void;
  // Per-task editor handlers (forwarded to EpicTaskEditor)
  onTitleChange: (id: string, title: string) => void;
  onSetLabels: (id: string, labels: string[]) => void;
  onAddLink: (blockerId: string, blockedId: string) => void;
  onRemoveLink: (blockerId: string, blockedId: string) => void;
  onClearTask: (id: "epic" | string) => void;
};

function stripHtml(html: string): string {
  const text = (html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > 80 ? text.slice(0, 79) + "…" : text;
}

export function EpicEditingView(props: Props) {
  const activeTask = props.activeId === "epic" ? null : props.tasks.find((t) => t.id === props.activeId) ?? null;
  const baking = props.bakeStatus === "baking";
  const cardsCols = props.analyzePanelOpen
    ? "w-[300px] shrink-0"
    : "flex-[0.5] min-w-[280px] max-w-[420px] shrink-0";

  return (
    <div className="flex flex-col gap-3 h-full min-h-0 px-6 py-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 shrink-0">
        <BackBar
          label="Back to kneading"
          confirmMessage="This will clear the current sub-tasks and per-task drafts."
          onBack={props.onBack}
        />
        <span className="flex-1" />
        <Button type="button" size="sm" variant="secondary" onClick={props.onAnalyzeAll} disabled={baking || props.tasks.length === 0}>
          Analyze all
        </Button>
        <Button type="button" size="sm" onClick={props.onBake} disabled={baking || props.tasks.length === 0}>
          Bake
        </Button>
      </div>

      {/* Body: editor (capped) + cards (flexible) + HelpPanel slot is rendered by the parent as a sibling next to this whole view */}
      <div className={"flex-1 min-h-0 flex gap-4 " + (baking ? "[&_form]:pointer-events-none [&_form]:opacity-60" : "")}>
        {/* Editor pane — flex-1 outside, max-w-3xl mx-auto inside (the no-empty-space cap). */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-3xl mx-auto">
            {activeTask ? (
              <EpicTaskEditor
                taskId={activeTask.id}
                allTasks={props.tasks}
                labels={activeTask.labels}
                blocks={activeTask.blocks}
                blockedBy={activeTask.blockedBy}
                refreshKey={props.refreshKey}
                onTitleChange={(title) => props.onTitleChange(activeTask.id, title)}
                onSetLabels={(labels) => props.onSetLabels(activeTask.id, labels)}
                onAddLink={props.onAddLink}
                onRemoveLink={props.onRemoveLink}
                onClear={() => props.onClearTask(activeTask.id)}
              />
            ) : (
              <Editor
                key={`epic:${props.refreshKey}`}
                namespace={NAMESPACE}
                onFinalize={() => {}}
                hideSubmit
                taskTypeLocked="epic"
                onClear={() => props.onClearTask("epic")}
              />
            )}
          </div>
        </div>

        {/* Cards column */}
        <div className={cardsCols + " border-l border-rule pl-2"}>
          <EpicTaskCards
            epicTitle={props.epicTitle}
            epicDescriptionPreview={stripHtml(props.epicDescriptionHtml)}
            tasks={props.tasks}
            activeId={props.activeId}
            bakeStatus={props.bakeStatus}
            bakeProgress={props.bakeProgress}
            bakeErrors={props.bakeErrors}
            bakeDone={props.bakeDone}
            bakeTotal={props.bakeTotal}
            onSelect={props.onSelectCard}
            onAdd={props.onAdd}
            onDelete={props.onDelete}
            onCancelBake={props.onCancelBake}
          />
        </div>

        {/* HelpPanel slot: the parent renders the HelpPanel as a sibling of this
            view in the outer layout. We don't render it here so it can survive
            mount/unmount transitions and keep its own state. The analyzePanelOpen
            prop is used only to size the cards column. */}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/components/epic/EpicEditingView.test.tsx
```

Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add components/epic/EpicEditingView.tsx tests/components/epic/EpicEditingView.test.tsx
git commit -m "feat(AI-36): EpicEditingView 3-column layout

Replaces EpicTabs as the editing surface. Top toolbar (Back / Analyze all /
Bake). Body splits into a capped-width editor pane (max-w-3xl mx-auto so
the form doesn't stretch on wide screens) and a flexible cards column
that expands to fill remaining width when the HelpPanel is closed and
shrinks to 300px when it's open. The HelpPanel mounts as a sibling of
this view in the parent layout — kept out of here so it survives toggle.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Wire `StandaloneApp` to `EpicEditingView` + delete `EpicTabs`

**Files:**
- Modify: `components/StandaloneApp.tsx`
- Delete: `components/epic/EpicTabs.tsx`
- Delete: `tests/components/epic/EpicTabs.test.tsx`

- [ ] **Step 1: Replace the EpicTabs JSX in `StandaloneApp.tsx`**

Find the render conditional from Task 6:

```tsx
epicMode && epicTasks.length > 0 ? (
  <div className="px-6 py-4 flex-1 min-h-0 flex flex-col max-w-5xl w-full">
    <EpicTabs
      tasks={epicTasks}
      active={activeTab}
      …
      onClearTask={…}
    />
  </div>
) : (
```

Replace with:

```tsx
epicMode && epicTasks.length > 0 ? (
  <EpicEditingView
    epicTitle={liveDraft?.title ?? ""}
    epicDescriptionHtml={liveDraft?.description ?? ""}
    tasks={epicTasks}
    activeId={activeTab}
    refreshKey={taskRefreshKey}
    bakeStatus={bakeStatus}
    bakeProgress={bakeProgress}
    bakeErrors={bakeErrors}
    bakeDone={Object.values(bakeProgress).filter((s) => s === "baked").length}
    bakeTotal={epicTasks.length}
    analyzePanelOpen={Boolean(analyzeTaskId)}
    onSelectCard={(id) => {
      setActiveTab(id);
      // Closing the analyze panel when switching tasks is intentional — the
      // user can re-open it for the new task via Analyze all or Analyze this.
      if (analyzeTaskId && analyzeTaskId !== id) setAnalyzeTaskId(null);
    }}
    onAdd={addTask}
    onDelete={deleteTask}
    onCancelBake={cancelBake}
    onBack={() => confirmReKnead(false)}
    onAnalyzeAll={startAnalyzeWalk}
    onBake={startBake}
    onTitleChange={taskTitleChange}
    onSetLabels={taskSetLabels}
    onAddLink={taskAddLink}
    onRemoveLink={taskRemoveLink}
    onClearTask={(id) => {
      if (id === "epic") {
        clearVisibleDraft();
      } else {
        const ns = epicTaskNamespace(id);
        const existing = loadDraft(ns);
        saveDraft(ns, { ...EMPTY_DRAFT, chatHistory: existing.chatHistory });
        setEpicTasks((prev) => {
          const next = setTitle(prev, id, "");
          persistEpicTasks(next);
          return next;
        });
        setTaskRefreshKey((k) => k + 1);
      }
    }}
  />
) : (
```

`bakeStatus`, `bakeProgress`, `bakeErrors`, `startBake`, `cancelBake` come from Phase C. **Temporarily stub them**:

```ts
// Phase C will replace these with the real bake state + handlers.
const bakeStatus: "idle" | "baking" | "baked" = "idle";
const bakeProgress: Record<string, "pending" | "baking" | "baked" | "failed"> = {};
const bakeErrors: Record<string, string> = {};
function startBake() { /* Phase C */ }
function cancelBake() { /* Phase C */ }
```

Place these right above the `useMemo` for `pendingEdits` (or anywhere convenient — they'll move in Phase C).

- [ ] **Step 2: Remove the `EpicTabs` import**

Delete:

```ts
import { EpicTabs } from "@/components/epic/EpicTabs";
```

Add:

```ts
import { EpicEditingView } from "@/components/epic/EpicEditingView";
```

- [ ] **Step 3: Delete EpicTabs.tsx + its test**

```bash
git rm components/epic/EpicTabs.tsx
ls tests/components/epic/EpicTabs.test.tsx 2>&1 && git rm tests/components/epic/EpicTabs.test.tsx
```

- [ ] **Step 4: Run the full test suite**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: PASS. Any test that imported `EpicTabs` needs to be deleted/rewritten — these were tests covering the OLD top-tab UX which is now retired.

- [ ] **Step 5: Smoke**

```bash
pnpm dev
```

Test: epic mode → knead → generate. The new 3-column editing view should appear. Clicking a card switches the editor. Analyze all opens the HelpPanel on the far right. Bake button does nothing yet (Phase C wires it).

- [ ] **Step 6: Commit**

```bash
git add components/StandaloneApp.tsx
git commit -m "feat(AI-36): wire StandaloneApp to EpicEditingView + delete EpicTabs

Replaces the EpicTabs top-tab surface with the new 3-column
EpicEditingView. Bake/cancel handlers and progress state are
stubbed locally until Phase C; the editing surface itself works
end-to-end. EpicTabs is removed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Phase B verification

**Files:** none

- [ ] **Step 1: Full sweep**

```bash
npx vitest run
npx tsc --noEmit
npx eslint . --ext .ts,.tsx
```

All green except the Phase-C-skipped test.

- [ ] **Step 2: Smoke**

`pnpm dev` → switch to Epic mode → knead → generate. Verify:
- Card grid on the right with the Epic card pinned at top + one card per task + + Add tile at the end.
- × delete on cards (hover-visible, inline-confirm).
- Click a card → editor switches.
- Top toolbar: Back to kneading (with confirm) / Analyze all / Bake (does nothing yet).
- Click Analyze all → HelpPanel shows up as a third column on the far right; cards column narrows to 300px.
- No empty space — the cards column expands when there's room.

No commit.

---

# Phase C — Bake + view + upload (Tasks 14–22)

## Task 14: `lib/epic/bake.ts` — `runBakeAll` orchestrator

**Files:**
- Create: `lib/epic/bake.ts`
- Create: `tests/lib/bake.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/bake.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runBakeAll, type BakeState } from "@/lib/epic/bake";
import { EMPTY_DRAFT } from "@/lib/draft/autosave";

vi.mock("@/lib/sse/client", () => ({
  subscribeToJob: (_jobId: string, onEvent: (e: { type: string; [k: string]: unknown }) => void) => {
    queueMicrotask(() => onEvent({ type: "finalized", payload: { story: { title: "S", markdown: "" }, markdown: "", requirement: {}, gates: { schema: { ok: true }, consistency: { ok: true } } } }));
    return () => {};
  },
}));

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ jobId: "job-1" }) }) as unknown as typeof fetch;
});
afterEach(() => { vi.restoreAllMocks(); });

const task = (id: string) => ({ id, draft: { ...EMPTY_DRAFT, title: `T-${id}`, description: `d ${id}` } });

describe("runBakeAll", () => {
  it("finalizes each task sequentially and emits baking -> baked", async () => {
    const seen: Array<[string, BakeState]> = [];
    const result = await runBakeAll({
      tasks: [task("a"), task("b")],
      onProgress: (id, state) => seen.push([id, state]),
    });
    expect(Object.keys(result.finalized).sort()).toEqual(["a", "b"]);
    expect(seen).toEqual([["a", "baking"], ["a", "baked"], ["b", "baking"], ["b", "baked"]]);
  });

  it("skips tasks already in finalizedExisting", async () => {
    const seen: Array<[string, BakeState]> = [];
    const result = await runBakeAll({
      tasks: [task("a"), task("b")],
      finalizedExisting: { a: { story: { title: "Cached", markdown: "" }, markdown: "", requirement: {}, gates: { schema: { ok: true }, consistency: { ok: true } } } as never },
      onProgress: (id, state) => seen.push([id, state]),
    });
    expect(Object.keys(result.finalized).sort()).toEqual(["a", "b"]);
    // 'a' was not re-finalized; only 'b' is in the emitted sequence
    expect(seen).toEqual([["b", "baking"], ["b", "baked"]]);
  });

  it("stops on the first error and reports failedId/failedReason", async () => {
    (global.fetch as unknown as { mockImplementation: (fn: () => unknown) => void }).mockImplementation(() => Promise.resolve({ ok: false, json: async () => ({ error: "boom" }) }));
    const seen: Array<[string, BakeState, string?]> = [];
    const result = await runBakeAll({
      tasks: [task("a"), task("b")],
      onProgress: (id, state, error) => seen.push([id, state, error]),
    });
    expect(result.failedId).toBe("a");
    expect(result.failedReason).toMatch(/boom/);
    expect(seen[seen.length - 1][1]).toBe("failed");
    // 'b' was never touched
    expect(seen.map((s) => s[0])).toEqual(["a", "a"]);
  });

  it("aborts gracefully when signal is fired between tasks", async () => {
    const ac = new AbortController();
    const seen: Array<[string, BakeState]> = [];
    const result = await runBakeAll({
      tasks: [task("a"), task("b")],
      signal: ac.signal,
      onProgress: (id, state) => {
        seen.push([id, state]);
        if (state === "baked") ac.abort();
      },
    });
    expect(Object.keys(result.finalized)).toEqual(["a"]);
    expect(result.failedId).toBe("b");
    expect(result.failedReason).toMatch(/cancelled/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/lib/bake.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the orchestrator**

Create `lib/epic/bake.ts`:

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
  finalizedExisting?: Record<string, FinalizedPayload>;
  signal?: AbortSignal;
  onProgress: (id: string, state: BakeState, error?: string) => void;
};

async function finalizeOne(draft: Draft, signal?: AbortSignal): Promise<FinalizedPayload> {
  const res = await fetch("/api/finalize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ draft }),
    signal,
  });
  const j = (await res.json().catch(() => ({}))) as { jobId?: string; error?: string };
  if (!res.ok || !j.jobId) throw new Error(j.error || `finalize failed (${res.status})`);
  return new Promise<FinalizedPayload>((resolve, reject) => {
    const unsub = subscribeToJob(j.jobId!, (e: JobEvent) => {
      if (e.type === "finalized") { unsub(); resolve(e.payload); }
      else if (e.type === "gates_failed") { unsub(); reject(new Error("schema gates failed for this task")); }
      else if (e.type === "error") { unsub(); reject(new Error(e.message)); }
    });
  });
}

export async function runBakeAll(args: Args): Promise<BakeResult> {
  const finalized: Record<string, FinalizedPayload> = { ...(args.finalizedExisting ?? {}) };
  for (const t of args.tasks) {
    if (finalized[t.id]) continue; // already done in a prior run
    if (args.signal?.aborted) {
      args.onProgress(t.id, "failed", "cancelled");
      return { finalized, failedId: t.id, failedReason: "cancelled" };
    }
    try {
      args.onProgress(t.id, "baking");
      const payload = await finalizeOne(t.draft, args.signal);
      finalized[t.id] = payload;
      args.onProgress(t.id, "baked");
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      args.onProgress(t.id, "failed", reason);
      return { finalized, failedId: t.id, failedReason: reason };
    }
  }
  return { finalized };
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/lib/bake.test.ts
```

Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add lib/epic/bake.ts tests/lib/bake.test.ts
git commit -m "feat(AI-36): runBakeAll orchestrator for eager per-task finalize

Sequential bake: POST /api/finalize per task, bridge SSE to capture
the finalized payload, emit baking -> baked / failed per task via
onProgress. Skips tasks already in finalizedExisting (retry path).
Stops on first error. Aborts gracefully between tasks when signal
fires.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: StandaloneApp — bake state + `startBake` + `cancelBake`

**Files:**
- Modify: `components/StandaloneApp.tsx`

- [ ] **Step 1: Add the state slots**

Replace the stub declarations from Task 12 with real state. Near the existing `taskRefreshKey`, `analyzeChatById`, etc., add:

```ts
const [bakeStatus, setBakeStatus] = useState<"idle" | "baking" | "baked">("idle");
const [bakeProgress, setBakeProgress] = useState<Record<string, "pending" | "baking" | "baked" | "failed">>({});
const [bakeErrors, setBakeErrors] = useState<Record<string, string>>({});
const [finalizedById, setFinalizedById] = useState<Record<string, FinalizedPayload>>({});
const [diagramsById, setDiagramsById] = useState<Record<string, Diagrams>>({});
const [bakeSelectedId, setBakeSelectedId] = useState<"epic" | string>("epic");
const bakeAbortRef = useRef<AbortController | null>(null);
```

Delete the Task-12 stubs (`const bakeStatus = "idle"`, etc.).

- [ ] **Step 2: Add `startBake` + `cancelBake`**

After the existing handlers (next to `clearVisibleDraft` / `startAnalyzeWalk`), add:

```ts
async function startBake() {
  if (bakeStatus === "baking") return;
  if (epicTasks.length === 0) return;
  setBakeStatus("baking");
  setBakeErrors({});
  // Seed pending for every task that isn't already baked.
  setBakeProgress((prev) => {
    const next: Record<string, "pending" | "baking" | "baked" | "failed"> = {};
    for (const t of epicTasks) next[t.id] = finalizedById[t.id] ? "baked" : "pending";
    return next;
  });
  const ac = new AbortController();
  bakeAbortRef.current = ac;
  const tasks = epicTasks.map((t) => ({ id: t.id, draft: loadDraft(epicTaskNamespace(t.id)) }));
  const { runBakeAll } = await import("@/lib/epic/bake");
  const result = await runBakeAll({
    tasks,
    finalizedExisting: finalizedById,
    signal: ac.signal,
    onProgress: (id, state, error) => {
      setBakeProgress((prev) => ({ ...prev, [id]: state }));
      if (state === "failed" && error) {
        setBakeErrors((prev) => ({ ...prev, [id]: error }));
      }
    },
  });
  bakeAbortRef.current = null;
  setFinalizedById(result.finalized);
  if (result.failedId) {
    setBakeStatus("idle");
    return;
  }
  setBakeStatus("baked");
  setBakeSelectedId("epic");
}

function cancelBake() {
  bakeAbortRef.current?.abort();
}
```

- [ ] **Step 3: Confirm `FinalizedPayload` + `Diagrams` are imported**

They should already be in the existing import block. Verify:

```ts
import type {
  AnalyzeFinding,
  Diagrams,
  FinalizedPayload,
  …
} from "@/lib/jobs/types";
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: TYPECHECK_OK.

- [ ] **Step 5: Smoke**

`pnpm dev` → epic mode → generate → click Bake. The cards should flip through pending → baking → baked. After all complete, nothing visible yet (the Bake-view render gate is added in Task 20). Cancel button on the cards strip should abort.

- [ ] **Step 6: Commit**

```bash
git add components/StandaloneApp.tsx
git commit -m "feat(AI-36): StandaloneApp bake state + startBake/cancelBake

Adds bakeStatus / bakeProgress / bakeErrors / finalizedById / diagramsById /
bakeSelectedId state. startBake runs runBakeAll with the current epic
tasks, hydrating finalizedById from any prior partial run. cancelBake
aborts. Bake-view render gate lands in Task 20.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 16: `BakeNav` component (left menu)

**Files:**
- Create: `components/epic/bake/BakeNav.tsx`
- Create: `tests/components/epic/bake/BakeNav.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/epic/bake/BakeNav.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BakeNav } from "@/components/epic/bake/BakeNav";

const tasks = [
  { id: "a", title: "Alpha", labels: [], blocks: [], blockedBy: [] },
  { id: "b", title: "Bravo", labels: [], blocks: [], blockedBy: [] },
];

const base = {
  tasks,
  selectedId: "epic" as const,
  finalizedIds: new Set(["a", "b"]),
  failedIds: {} as Record<string, string>,
  onSelect: () => {},
  onUploadAll: () => {},
  onBackToEditing: () => {},
};

describe("<BakeNav>", () => {
  it("renders Epic overview + one entry per task", () => {
    render(<BakeNav {...base} />);
    expect(screen.getByRole("button", { name: /epic overview/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Alpha/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Bravo/ })).toBeInTheDocument();
  });

  it("fires onSelect with the right id", async () => {
    const onSelect = vi.fn();
    render(<BakeNav {...base} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: /Alpha/ }));
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("Upload all fires onUploadAll", async () => {
    const onUploadAll = vi.fn();
    render(<BakeNav {...base} onUploadAll={onUploadAll} />);
    await userEvent.click(screen.getByRole("button", { name: /upload all to jira/i }));
    expect(onUploadAll).toHaveBeenCalledTimes(1);
  });

  it("Back to editing fires onBackToEditing", async () => {
    const onBackToEditing = vi.fn();
    render(<BakeNav {...base} onBackToEditing={onBackToEditing} />);
    await userEvent.click(screen.getByRole("button", { name: /back to editing/i }));
    expect(onBackToEditing).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/components/epic/bake/BakeNav.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `components/epic/bake/BakeNav.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/Button";
import type { EpicTask } from "@/lib/epic/tasks";

type Props = {
  tasks: EpicTask[];
  selectedId: "epic" | string;
  finalizedIds: Set<string>;
  failedIds: Record<string, string>;
  onSelect: (id: "epic" | string) => void;
  onUploadAll: () => void;
  onBackToEditing: () => void;
};

function entryClass(active: boolean): string {
  return (
    "w-full text-left px-3 py-2 rounded-md text-hig-body transition-colors " +
    (active ? "bg-accent-tint text-accent font-medium" : "text-ink hover:bg-surface-muted")
  );
}

export function BakeNav(props: Props) {
  return (
    <aside className="w-[280px] shrink-0 border-r border-rule bg-surface flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-1">
        <button
          type="button"
          onClick={() => props.onSelect("epic")}
          className={entryClass(props.selectedId === "epic")}
        >
          Epic overview
        </button>
        <div className="mt-2 px-3 hig-section-label">Tasks</div>
        {props.tasks.map((t) => {
          const baked = props.finalizedIds.has(t.id);
          const failed = props.failedIds[t.id];
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => props.onSelect(t.id)}
              className={entryClass(props.selectedId === t.id)}
            >
              <span className="flex items-center gap-2">
                <span className="flex-1 truncate">{t.title || "(untitled)"}</span>
                {baked && <span className="text-success text-[12px]" aria-label="baked">✓</span>}
                {failed && <span title={failed} className="text-danger text-[12px]" aria-label="failed">⨯</span>}
              </span>
            </button>
          );
        })}
      </div>
      <div className="p-3 border-t border-rule flex flex-col gap-2">
        <Button onClick={props.onUploadAll}>Upload all to Jira</Button>
        <Button variant="secondary" size="sm" onClick={props.onBackToEditing}>
          ← Back to editing
        </Button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/components/epic/bake/BakeNav.test.tsx
```

Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add components/epic/bake/BakeNav.tsx tests/components/epic/bake/BakeNav.test.tsx
git commit -m "feat(AI-36): BakeNav left-menu for the post-bake view

Renders Epic overview pinned at top + one entry per task. ✓ / ⨯
indicators reflect the bake result. Bottom strip: Upload all to Jira
(primary) and ← Back to editing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 17: `BakeTaskPreview` adapter

**Files:**
- Create: `components/epic/bake/BakeTaskPreview.tsx`
- Create: `tests/components/epic/bake/BakeTaskPreview.test.tsx`

This wraps the existing `components/Preview.tsx` and feeds it per-task state from `finalizedById` + `diagramsById`.

- [ ] **Step 1: Write the failing test**

Create `tests/components/epic/bake/BakeTaskPreview.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BakeTaskPreview } from "@/components/epic/bake/BakeTaskPreview";
import type { FinalizedPayload } from "@/lib/jobs/types";

vi.mock("@/components/Preview", () => ({
  Preview: ({ payload }: { payload: FinalizedPayload }) => (
    <div data-testid="preview-stub">title:{payload.story.title}</div>
  ),
}));

const finalized: FinalizedPayload = {
  story: { title: "Build the thing", markdown: "## body" },
  markdown: "## body",
  requirement: { title: "Build the thing" } as never,
  gates: { schema: { ok: true }, consistency: { ok: true } } as never,
};

describe("<BakeTaskPreview>", () => {
  it("renders the Preview with the per-task finalized payload", () => {
    render(
      <BakeTaskPreview
        taskId="a"
        finalized={finalized}
        diagrams={undefined}
        onCreateDiagrams={() => {}}
        creatingDiagrams={false}
        onEditDiagram={() => {}}
        onRegenerateDiagram={() => {}}
        regeneratingFormat={null}
        onAnalyzeDiagrams={() => {}}
        analyzingDiagrams={false}
        analysisFindings={null}
        onApplyAnalysis={() => {}}
        applyingAnalysis={false}
        onDismissAnalysis={() => {}}
        onMarkdownChange={() => {}}
      />,
    );
    expect(screen.getByTestId("preview-stub")).toHaveTextContent("title:Build the thing");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/components/epic/bake/BakeTaskPreview.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `components/epic/bake/BakeTaskPreview.tsx`:

```tsx
"use client";

import { Preview } from "@/components/Preview";
import type { AnalyzeFinding, Diagrams, FinalizedPayload, MermaidFormat } from "@/lib/jobs/types";

type Props = {
  taskId: string;
  finalized: FinalizedPayload;
  diagrams?: Diagrams;
  onCreateDiagrams: () => void;
  creatingDiagrams: boolean;
  onEditDiagram: (format: MermaidFormat, source: string) => void;
  onRegenerateDiagram: (format: MermaidFormat) => void;
  regeneratingFormat: MermaidFormat | null;
  onAnalyzeDiagrams: () => void;
  analyzingDiagrams: boolean;
  analysisFindings: AnalyzeFinding[] | null;
  onApplyAnalysis: (acceptedIds: string[]) => void;
  applyingAnalysis: boolean;
  onDismissAnalysis: () => void;
  onMarkdownChange: (next: string) => void;
};

export function BakeTaskPreview(props: Props) {
  return (
    <Preview
      payload={props.finalized}
      diagrams={props.diagrams}
      onCreateDiagrams={props.onCreateDiagrams}
      creatingDiagrams={props.creatingDiagrams}
      onEditDiagram={props.onEditDiagram}
      onRegenerateDiagram={props.onRegenerateDiagram}
      regeneratingFormat={props.regeneratingFormat}
      onAnalyzeDiagrams={props.onAnalyzeDiagrams}
      analyzingDiagrams={props.analyzingDiagrams}
      analysisFindings={props.analysisFindings}
      onApplyAnalysis={props.onApplyAnalysis}
      applyingAnalysis={props.applyingAnalysis}
      onDismissAnalysis={props.onDismissAnalysis}
      onMarkdownChange={props.onMarkdownChange}
      // No onHelp (per-task diagrams Help is out of scope for v1).
      // No jiraConnected/onExportToJira (per-task export is out of scope; batch only).
    />
  );
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/components/epic/bake/BakeTaskPreview.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/epic/bake/BakeTaskPreview.tsx tests/components/epic/bake/BakeTaskPreview.test.tsx
git commit -m "feat(AI-36): BakeTaskPreview adapter around the single-task Preview

Per-task Preview pane fed with finalized + diagrams from the parent's
finalizedById/diagramsById maps. Doesn't wire onHelp (per-task diagrams
Help is out of v1) or onExportToJira (per-task export is out of v1 —
batch only).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 18: `BakeView` (composes nav + main pane)

**Files:**
- Create: `components/epic/bake/BakeView.tsx`
- Create: `tests/components/epic/bake/BakeView.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/epic/bake/BakeView.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BakeView } from "@/components/epic/bake/BakeView";
import type { FinalizedPayload } from "@/lib/jobs/types";

vi.mock("@/components/MermaidDiagram", () => ({
  MermaidDiagram: ({ source }: { source: string }) => <pre data-testid="md-source">{source}</pre>,
}));
vi.mock("@/components/Preview", () => ({
  Preview: ({ payload }: { payload: FinalizedPayload }) => <div data-testid="preview">{payload.story.title}</div>,
}));

const tasks = [
  { id: "a", title: "Alpha", labels: [], blocks: [], blockedBy: [] },
  { id: "b", title: "Bravo", labels: [], blocks: [], blockedBy: [] },
];

const finalized = {
  a: { story: { title: "Alpha story", markdown: "" }, markdown: "", requirement: {}, gates: { schema: { ok: true }, consistency: { ok: true } } } as FinalizedPayload,
  b: { story: { title: "Bravo story", markdown: "" }, markdown: "", requirement: {}, gates: { schema: { ok: true }, consistency: { ok: true } } } as FinalizedPayload,
};

const baseProps = {
  tasks,
  selectedId: "epic" as const,
  finalizedById: finalized,
  diagramsById: {} as Record<string, never>,
  failedIds: {} as Record<string, string>,
  onSelect: () => {},
  onUploadAll: () => {},
  onBackToEditing: () => {},
  onCreateDiagrams: () => {},
  creatingForId: null,
  onEditDiagram: () => {},
  onRegenerateDiagram: () => {},
  regeneratingForId: null,
  regeneratingFormat: null,
  onAnalyzeDiagrams: () => {},
  analyzingForId: null,
  analysisFindings: {} as Record<string, never>,
  onApplyAnalysis: () => {},
  applyingForId: null,
  onDismissAnalysis: () => {},
  onMarkdownChange: () => {},
};

describe("<BakeView>", () => {
  it("renders Epic overview by default (task graph)", () => {
    render(<BakeView {...baseProps} />);
    const src = screen.getByTestId("md-source").textContent ?? "";
    expect(src).toContain("graph TD");
    expect(src).toContain("Alpha");
  });

  it("renders the BakeTaskPreview when a task is selected", () => {
    render(<BakeView {...baseProps} selectedId="a" />);
    expect(screen.getByTestId("preview")).toHaveTextContent("Alpha story");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/components/epic/bake/BakeView.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `components/epic/bake/BakeView.tsx`:

```tsx
"use client";

import { BakeNav } from "@/components/epic/bake/BakeNav";
import { BakeTaskPreview } from "@/components/epic/bake/BakeTaskPreview";
import { TaskGraph } from "@/components/epic/TaskGraph";
import type { EpicTask } from "@/lib/epic/tasks";
import type { AnalyzeFinding, Diagrams, FinalizedPayload, MermaidFormat } from "@/lib/jobs/types";

type Props = {
  tasks: EpicTask[];
  selectedId: "epic" | string;
  finalizedById: Record<string, FinalizedPayload>;
  diagramsById: Record<string, Diagrams | undefined>;
  failedIds: Record<string, string>;
  // Nav handlers
  onSelect: (id: "epic" | string) => void;
  onUploadAll: () => void;
  onBackToEditing: () => void;
  // Per-task Preview handlers — the parent threads them through with the
  // current selected id baked in (so we just pass them through unchanged).
  onCreateDiagrams: (id: string) => void;
  creatingForId: string | null;
  onEditDiagram: (id: string, format: MermaidFormat, source: string) => void;
  onRegenerateDiagram: (id: string, format: MermaidFormat) => void;
  regeneratingForId: string | null;
  regeneratingFormat: MermaidFormat | null;
  onAnalyzeDiagrams: (id: string) => void;
  analyzingForId: string | null;
  analysisFindings: Record<string, AnalyzeFinding[] | null>;
  onApplyAnalysis: (id: string, acceptedIds: string[]) => void;
  applyingForId: string | null;
  onDismissAnalysis: (id: string) => void;
  onMarkdownChange: (id: string, next: string) => void;
};

export function BakeView(props: Props) {
  const finalizedIds = new Set(Object.keys(props.finalizedById));
  const selectedTask = props.selectedId === "epic" ? null : props.tasks.find((t) => t.id === props.selectedId) ?? null;
  const selectedFinalized = selectedTask ? props.finalizedById[selectedTask.id] : undefined;

  return (
    <div className="flex-1 min-h-0 flex">
      <BakeNav
        tasks={props.tasks}
        selectedId={props.selectedId}
        finalizedIds={finalizedIds}
        failedIds={props.failedIds}
        onSelect={props.onSelect}
        onUploadAll={props.onUploadAll}
        onBackToEditing={props.onBackToEditing}
      />
      <div className="flex-1 min-w-0 overflow-y-auto">
        {!selectedTask ? (
          <div className="p-6 max-w-4xl">
            <h2 className="text-hig-title3 mb-3">Epic overview</h2>
            <TaskGraph tasks={props.tasks} reviews={{}} />
          </div>
        ) : selectedFinalized ? (
          <BakeTaskPreview
            taskId={selectedTask.id}
            finalized={selectedFinalized}
            diagrams={props.diagramsById[selectedTask.id]}
            onCreateDiagrams={() => props.onCreateDiagrams(selectedTask.id)}
            creatingDiagrams={props.creatingForId === selectedTask.id}
            onEditDiagram={(f, s) => props.onEditDiagram(selectedTask.id, f, s)}
            onRegenerateDiagram={(f) => props.onRegenerateDiagram(selectedTask.id, f)}
            regeneratingFormat={props.regeneratingForId === selectedTask.id ? props.regeneratingFormat : null}
            onAnalyzeDiagrams={() => props.onAnalyzeDiagrams(selectedTask.id)}
            analyzingDiagrams={props.analyzingForId === selectedTask.id}
            analysisFindings={props.analysisFindings[selectedTask.id] ?? null}
            onApplyAnalysis={(ids) => props.onApplyAnalysis(selectedTask.id, ids)}
            applyingAnalysis={props.applyingForId === selectedTask.id}
            onDismissAnalysis={() => props.onDismissAnalysis(selectedTask.id)}
            onMarkdownChange={(next) => props.onMarkdownChange(selectedTask.id, next)}
          />
        ) : (
          <div className="p-6 text-hig-body text-ink-secondary">
            This task was not finalized (failed during bake). Go back to editing and re-bake.
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/components/epic/bake/BakeView.test.tsx
```

Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add components/epic/bake/BakeView.tsx tests/components/epic/bake/BakeView.test.tsx
git commit -m "feat(AI-36): BakeView composes nav + per-task Preview + Epic overview

Left BakeNav + right main pane. The Epic overview entry renders the
TaskGraph (with the SP4 tighter palette). Selecting a task renders
BakeTaskPreview against that task's cached FinalizedPayload + Diagrams.
A failed task shows a 'go back and re-bake' placeholder.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 19: Wire StandaloneApp render gate + per-task diagrams handlers

**Files:**
- Modify: `components/StandaloneApp.tsx`

This task adds the actual Bake-view render conditional + the per-task diagrams handlers (Create / Edit / Regenerate / Analyze / Apply / Dismiss / Markdown).

- [ ] **Step 1: Add the render-gate branch**

In the existing render conditional (Task 12 introduced):

```tsx
epicMode && epicTasks.length > 0 ? (
  <EpicEditingView … />
) : (
```

Change to:

```tsx
epicMode && bakeStatus === "baked" ? (
  <BakeView
    tasks={epicTasks}
    selectedId={bakeSelectedId}
    finalizedById={finalizedById}
    diagramsById={diagramsById}
    failedIds={bakeErrors}
    onSelect={setBakeSelectedId}
    onUploadAll={() => setUploadOpen(true)}
    onBackToEditing={() => setBakeStatus("idle")}
    onCreateDiagrams={createDiagramsForTask}
    creatingForId={creatingForId}
    onEditDiagram={editDiagramForTask}
    onRegenerateDiagram={regenerateDiagramForTask}
    regeneratingForId={regeneratingForId}
    regeneratingFormat={regeneratingFormatForTask}
    onAnalyzeDiagrams={analyzeDiagramsForTask}
    analyzingForId={analyzingForId}
    analysisFindings={analysisFindingsById}
    onApplyAnalysis={applyAnalysisForTask}
    applyingForId={applyingForId}
    onDismissAnalysis={dismissAnalysisForTask}
    onMarkdownChange={onMarkdownChangeForTask}
  />
) : epicMode && epicTasks.length > 0 ? (
  <EpicEditingView … />
) : (
```

- [ ] **Step 2: Add the per-task diagrams state slots**

Near the other bake state:

```ts
const [creatingForId, setCreatingForId] = useState<string | null>(null);
const [regeneratingForId, setRegeneratingForId] = useState<string | null>(null);
const [regeneratingFormatForTask, setRegeneratingFormatForTask] = useState<MermaidFormat | null>(null);
const [analyzingForId, setAnalyzingForId] = useState<string | null>(null);
const [applyingForId, setApplyingForId] = useState<string | null>(null);
const [analysisFindingsById, setAnalysisFindingsById] = useState<Record<string, AnalyzeFinding[] | null>>({});
```

- [ ] **Step 3: Add the per-task diagrams handlers**

After the bake handlers, add the following — these mirror the single-task `createDiagrams` / `regenerateDiagram` / `analyzeDiagrams` / `applyAnalysis` / `editDiagram` / `onMarkdownChange` functions but key everything by task id:

```ts
async function createDiagramsForTask(id: string) {
  const payload = finalizedById[id];
  if (!payload) return;
  setCreatingForId(id);
  try {
    const res = await fetch("/api/diagrams/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requirement: payload.requirement,
        story: payload.story,
        draft: loadDraft(epicTaskNamespace(id)),
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.jobId) {
      // Errors surface in the per-task Preview's error state — we just stop the spinner here.
      return;
    }
    const unsub = subscribeToJob(json.jobId, (e) => {
      if (e.type === "diagrams_created") {
        setDiagramsById((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), ...e.payload } }));
        setCreatingForId(null);
        unsub();
      } else if (e.type === "error") {
        setCreatingForId(null);
        unsub();
      }
    });
  } catch {
    setCreatingForId(null);
  }
}

function editDiagramForTask(id: string, format: MermaidFormat, source: string) {
  setDiagramsById((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), [format]: source } }));
}

async function regenerateDiagramForTask(id: string, format: MermaidFormat) {
  const payload = finalizedById[id];
  if (!payload) return;
  setRegeneratingForId(id);
  setRegeneratingFormatForTask(format);
  try {
    const res = await fetch("/api/diagrams/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requirement: payload.requirement,
        story: payload.story,
        draft: loadDraft(epicTaskNamespace(id)),
        formats: [format],
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.jobId) {
      setRegeneratingForId(null);
      setRegeneratingFormatForTask(null);
      return;
    }
    const unsub = subscribeToJob(json.jobId, (e) => {
      if (e.type === "diagrams_created") {
        setDiagramsById((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), ...e.payload } }));
        setRegeneratingForId(null);
        setRegeneratingFormatForTask(null);
        unsub();
      } else if (e.type === "error") {
        setRegeneratingForId(null);
        setRegeneratingFormatForTask(null);
        unsub();
      }
    });
  } catch {
    setRegeneratingForId(null);
    setRegeneratingFormatForTask(null);
  }
}

async function analyzeDiagramsForTask(id: string) {
  const payload = finalizedById[id];
  const diagrams = diagramsById[id];
  if (!payload || !diagrams) return;
  setAnalyzingForId(id);
  try {
    const res = await fetch("/api/diagrams/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requirement: payload.requirement, story: payload.story, mermaid: diagrams }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.jobId) { setAnalyzingForId(null); return; }
    const unsub = subscribeToJob(json.jobId, (e) => {
      if (e.type === "diagrams_analyzed") {
        setAnalysisFindingsById((prev) => ({ ...prev, [id]: e.payload.findings }));
        setAnalyzingForId(null);
        unsub();
      } else if (e.type === "error") {
        setAnalyzingForId(null);
        unsub();
      }
    });
  } catch {
    setAnalyzingForId(null);
  }
}

function applyAnalysisForTask(id: string, acceptedIds: string[]) {
  const findings = analysisFindingsById[id];
  if (!findings) return;
  setApplyingForId(id);
  try {
    let nextDiagrams: Diagrams = { ...(diagramsById[id] ?? {}) };
    for (const fid of acceptedIds) {
      const f = findings.find((x) => x.id === fid);
      if (f?.proposedSync?.mermaid) nextDiagrams = { ...nextDiagrams, ...f.proposedSync.mermaid };
    }
    setDiagramsById((prev) => ({ ...prev, [id]: nextDiagrams }));
    setAnalysisFindingsById((prev) => ({ ...prev, [id]: null }));
  } finally {
    setApplyingForId(null);
  }
}

function dismissAnalysisForTask(id: string) {
  setAnalysisFindingsById((prev) => ({ ...prev, [id]: null }));
}

function onMarkdownChangeForTask(id: string, next: string) {
  setFinalizedById((prev) => {
    const cur = prev[id];
    if (!cur) return prev;
    return { ...prev, [id]: { ...cur, markdown: next } };
  });
}
```

- [ ] **Step 4: Update the UploadSheet builder to include cached payloads**

Find the `<UploadSheet … tasks={uploadTasks} … />` mount block. Update `uploadTasks` to include the cached finalize + diagrams:

```tsx
const uploadTasks: UploadTask[] = epicTasks.map((t) => ({
  id: t.id,
  draft: loadDraft(epicTaskNamespace(t.id)),
  labels: t.labels,
  finalizedPayload: finalizedById[t.id],
  diagrams: diagramsById[t.id],
}));
```

The `UploadTask` type extension lands in Task 21. To unblock typecheck for now, you can add `as UploadTask` cast if needed, or land Task 21 before this step. **Order matters here — land Task 21 immediately after this task.**

- [ ] **Step 5: Add `BakeView` import**

```ts
import { BakeView } from "@/components/epic/bake/BakeView";
```

- [ ] **Step 6: Run tests**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: typecheck may fail if Task 21 hasn't landed (UploadTask doesn't yet accept `finalizedPayload` / `diagrams`). Land Task 21 immediately and re-run.

- [ ] **Step 7: Commit**

```bash
git add components/StandaloneApp.tsx
git commit -m "feat(AI-36): StandaloneApp Bake-view render gate + per-task diagrams

Adds the bakeStatus === 'baked' render branch that mounts BakeView with
all per-task handlers keyed by task id. The handlers mirror the
single-task createDiagrams / regenerateDiagram / analyzeDiagrams /
applyAnalysis / editDiagram / onMarkdownChange functions but route
state into the finalizedById / diagramsById / analysisFindingsById maps.

UploadSheet builder now threads finalizedPayload + diagrams into each
UploadTask so the orchestrator can skip per-task finalize (lands in
Task 21).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 20: (merged into Task 19 — render-gate landed there)

Skip — the render gate ships in Task 19.

---

## Task 21: Upload orchestrator skip-finalize + diagrams

**Files:**
- Modify: `lib/upload/types.ts`
- Modify: `lib/upload/orchestrator.ts`
- Modify: `tests/lib/upload-orchestrator.test.ts`

- [ ] **Step 1: Extend `UploadTask`**

In `lib/upload/types.ts`, change the type to:

```ts
import type { Draft } from "@/lib/draft/autosave";
import type { Diagrams, FinalizedPayload } from "@/lib/jobs/types";

// (keep RowState + RowsState as-is)

export type UploadTask = {
  id: string;
  draft: Draft;
  assignee?: string;
  labels: string[];
  // SP5: when set, the orchestrator skips POST /api/finalize and uses this
  // cached payload (produced by the Bake step) for the export call.
  finalizedPayload?: FinalizedPayload;
  // SP5: cached per-task diagrams to attach to the Jira issue.
  diagrams?: Diagrams;
};

// (UploadDestination + BatchResult unchanged)
```

- [ ] **Step 2: Update `runBatchUpload`**

In `lib/upload/orchestrator.ts`:

1. Update `exportOne` to take an optional `diagrams` and include it in the export body:

```ts
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
```

2. Update the loop in `runBatchUpload` to skip finalize when `task.finalizedPayload` is set:

```ts
      args.onRow(task.id, { kind: "finalizing" });
      const payload = task.finalizedPayload ?? await finalizeOne(task, args.signal);
```

(The `finalizing` event still fires for consistency, but if the cached payload is present the network call is skipped — the row immediately moves to `uploading` on the next setState.)

- [ ] **Step 3: Add tests for the new behaviour**

Append to `tests/lib/upload-orchestrator.test.ts` inside the existing `describe("runBatchUpload", ...)`:

```ts
  it("skips POST /api/finalize when task.finalizedPayload is provided", async () => {
    const calls: string[] = [];
    (global.fetch as unknown as { mockImplementation: (fn: (url: string, init?: RequestInit) => unknown) => void }).mockImplementation((url: string) => {
      calls.push(url);
      if (url.includes("/api/jira/export")) {
        return Promise.resolve({ ok: true, json: async () => ({ key: "AI-1", url: "https://x/AI-1" }) });
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    const cachedPayload = { story: { title: "Cached", markdown: "" }, markdown: "", requirement: {}, gates: { schema: { ok: true }, consistency: { ok: true } } } as never;
    const result = await runBatchUpload({
      tasks: [{ ...task("a"), finalizedPayload: cachedPayload }],
      destination: dest,
      onRow: () => {},
    });
    expect(result.uploaded).toEqual(["a"]);
    expect(calls.some((u) => u.includes("/api/finalize"))).toBe(false);
    expect(calls.some((u) => u.includes("/api/jira/export"))).toBe(true);
  });

  it("passes task.diagrams through to the export body when set", async () => {
    let body: { diagrams?: Record<string, string> } = {};
    (global.fetch as unknown as { mockImplementation: (fn: (url: string, init?: RequestInit) => unknown) => void }).mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/api/jira/export")) {
        body = JSON.parse((init?.body as string) ?? "{}");
        return Promise.resolve({ ok: true, json: async () => ({ key: "AI-1", url: "https://x/AI-1" }) });
      }
      return Promise.reject(new Error("unexpected"));
    });
    const cachedPayload = { story: { title: "C", markdown: "" }, markdown: "", requirement: {}, gates: { schema: { ok: true }, consistency: { ok: true } } } as never;
    await runBatchUpload({
      tasks: [{ ...task("a"), finalizedPayload: cachedPayload, diagrams: { flow: "flowchart TD\nA-->B" } }],
      destination: dest,
      onRow: () => {},
    });
    expect(body.diagrams).toEqual({ flow: "flowchart TD\nA-->B" });
  });
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/lib/upload-orchestrator.test.ts
```

Expected: PASS (9/9 — the 7 existing tests plus 2 new).

- [ ] **Step 5: Re-verify the broader sweep**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add lib/upload/types.ts lib/upload/orchestrator.ts tests/lib/upload-orchestrator.test.ts
git commit -m "feat(AI-36): orchestrator skips finalize + threads diagrams when cached

UploadTask gains optional finalizedPayload + diagrams. runBatchUpload
uses the cached payload when present (no /api/finalize call) and includes
the diagrams in the /api/jira/export body so per-task diagrams are
attached to the Jira issue.

Two new tests cover the skip-finalize and diagrams-passthrough paths.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 22: Final verification

**Files:** none

- [ ] **Step 1: Full test suite**

```bash
npx vitest run
```

Expected: all tests pass. Re-enable the test that was `.skip`'d in Task 6 if possible by updating its seed to use the new Bake → Upload flow. If not feasible in this verification step, leave the skip with a documented reason.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: TYPECHECK_OK.

- [ ] **Step 3: Lint**

```bash
npx eslint . --ext .ts,.tsx
```

Expected: clean.

- [ ] **Step 4: Smoke**

```bash
pnpm dev
```

End-to-end test path:

1. Switch to **Epic** mode.
2. Type a description, click **Knead tasks**, answer at least one round, advance until **Generate sub-tasks** is offered.
3. Click **Generate sub-tasks** → the new 3-column editing view appears (editor / cards / [HelpPanel hidden]).
4. Click a sub-task card → editor switches.
5. Hover a sub-task card → `×` appears; click → inline confirm → Yes → task deleted.
6. Click **+ Add task** tile → new card appears, switches to it.
7. Click **Analyze this task** path... wait — that button moved off the editor in this rework. The analyze flow is reached through **Analyze all** in the toolbar (no per-card analyze affordance was added). **Note for follow-up**: a per-card analyze affordance is a possible enhancement but out of v1.
8. Click **Analyze all** → HelpPanel appears as the third column; cards column narrows to 300px.
9. Close the HelpPanel via its existing `Close` button → cards column expands again.
10. Click **Bake**.
11. Cards show "Baking N/M…" sticky strip; each card flips pending → baking → baked.
12. After all baked, the screen transitions to the Bake view: left BakeNav, main pane shows the **Epic overview** (task graph).
13. Click a task entry → main pane shows the per-task Preview with the finalized markdown.
14. Click **Create diagrams** → diagrams render for that task.
15. Click **Upload all to Jira** → existing UploadSheet opens. Pick site/project/issue type. Default radio is "Create a new epic from this batch".
16. **Start upload** → orchestrator skips per-task finalize (uses cached payloads), creates a new epic in Jira, attaches each sub-task with diagrams.
17. Results phase shows uploaded issue keys.

Items that should NOT be present (cleanup verification):
- Top tab strip (gone).
- Reviewer status chips / Approve/Deny/Change-requested buttons (gone).
- Assignee field (gone).
- "Diagram from tasks arrives in a later phase." placeholder (replaced by Epic overview).
- Interference warning banners (gone).
- The per-card analyze affordance (intentionally absent — out of v1).

- [ ] **Step 5: No commit**

Verification only.

---

## Self-review checklist

- **Spec coverage:**
  - §1 Editing phase (3-col, cards, no-empty-space) → Tasks 8–12.
  - §2 Eager Bake action → Tasks 14, 15.
  - §3 Bake view → Tasks 16–19.
  - §4 Upload changes (skip-finalize, diagrams passthrough) → Task 21.
  - §5 Cleanup → Tasks 1–6.
  - §6 State changes → Tasks 6 (remove old), 15 + 19 (add new).
  - All 9 decisions from the spec map to tasks. ✓
- **Placeholder scan:** none.
- **Type consistency:**
  - `BakeState` type defined in Task 14, used identically in Tasks 8, 9, 11, 15.
  - `UploadTask` extension (Task 21) matches the consumer in Task 19's `uploadTasks` builder.
  - `BakeView` props (Task 18) match the wire-up in Task 19's render gate.
  - `bakeProgress` / `bakeErrors` shape consistent across StandaloneApp ↔ EpicEditingView ↔ EpicTaskCards.
- **Phase boundaries:** Phase A leaves the app working with EpicTabs intact and Bake stubbed. Phase B replaces EpicTabs but bake still does nothing. Phase C wires bake + the new view. Each phase is independently mergeable.
- **Commit hygiene:** every commit ends with the `Co-Authored-By` trailer, uses targeted `git add`, never touches `prompts/types/*`.
