# App-wide no-empty-space layout + description-editor fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the patchwork of `max-w-5xl`/`max-w-4xl` caps with one consistent flex layout rule (primary `flex-1` + side panels `shrink-0` with min/max bounds), and fix the description-editor overlap inside EpicTaskEditor.

**Architecture:** Each phase's body becomes a `flex min-h-0` row. The Editor pane keeps `max-w-5xl mx-auto` ONLY in single-mode-idle with no side panels visible. The Editor gains a `nested?: boolean` prop that drops `h-full` for the EpicTaskEditor context. RichTextDescription's placeholder switches from negative-margin to absolute positioning.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript 5.6 · Vitest 4.1 · Tailwind 3.4 (HIG tokens) · TipTap 3.23.

**Test runner:** `npx vitest run <pattern>`. Typecheck: `npx tsc --noEmit`. Lint: `npx eslint . --ext .ts,.tsx`.

**Per-task hygiene:** targeted `git add`; NEVER stage `prompts/types/*` (template-sync drift). Trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`. No `git push`.

---

## File Map

**Modified:**
- `components/StandaloneApp.tsx` — single-mode-idle render branch becomes one `flex min-h-0` row; the Editor wrapper applies `max-w-5xl mx-auto` only when no side panel is present.
- `components/Editor.tsx` — add `nested?: boolean` prop; drop `h-full` on the `<form>` when nested.
- `components/epic/EpicTaskEditor.tsx` — pass `nested` to the embedded Editor; outer wrapper unchanged (`flex flex-col gap-4`).
- `components/RichTextDescription.tsx` — wrap EditorContent + placeholder in `relative` container; placeholder uses `absolute inset-0`.
- `components/HelpPanel.tsx` — replace fixed `w-[400px]` with `min-w-[340px] max-w-[480px] flex-shrink-0`.
- `components/epic/EpicEditingView.tsx` — tighten `cardsCols` widths per Decision 4 of the spec; add transition class.
- `components/epic/bake/BakeView.tsx` — drop the `p-6 max-w-4xl` wrapper around the TaskGraph; TaskGraph fills the main pane.
- `tests/components/epic/EpicTaskEditor.test.tsx` — assert that the embedded Editor receives `nested` (or the form is not `h-full`).

**No new files.** No deletions.

---

## Task 1: Add `nested` prop to Editor

**Files:**
- Modify: `components/Editor.tsx`

- [ ] **Step 1: Add the prop to the Props type**

Open `components/Editor.tsx`. Find the `Props` type near the top of the file. Add `nested?: boolean` between `hideSubmit` and `taskTypeLocked`:

```ts
type Props = {
  namespace: string;
  onFinalize: (draft: Draft) => void;
  disabled?: boolean;
  onHelp?: () => void;
  onClear?: () => void;
  mode?: "single" | "epic";
  onKnead?: (draft: Draft) => void;
  kneadDisabled?: boolean;
  onDraftChange?: (draft: Draft) => void;
  hideSubmit?: boolean;
  nested?: boolean;
  taskTypeLocked?: string;
};
```

- [ ] **Step 2: Destructure in the function signature**

Find the `export function Editor({...}: Props)` declaration. Add `nested = false` to the destructure list:

```ts
export function Editor({
  namespace, onFinalize, disabled = false, onHelp, onClear,
  mode = "single", onKnead, kneadDisabled = false, onDraftChange,
  hideSubmit = false, nested = false, taskTypeLocked,
}: Props) {
```

- [ ] **Step 3: Drop `h-full` from the form when nested**

Find the `<form>` element (around line 195) with `className="hig-card p-5 flex flex-col gap-4 h-full"`. Replace with a conditional class:

```tsx
    <form
      className={"hig-card p-5 flex flex-col gap-4 " + (nested ? "" : "h-full")}
      onSubmit={(e) => {
```

- [ ] **Step 4: Also drop the inner scroll container's flex-1 in nested mode**

The inner `<div className="flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto">` (around line 245) handles internal scrolling. In nested mode the parent's scroll wins, so use `flex flex-col gap-4` only:

```tsx
      <div className={"flex flex-col gap-4 " + (nested ? "" : "flex-1 min-h-0 overflow-y-auto")}>
```

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: TYPECHECK_OK. The `nested` prop is optional, so existing call sites continue to compile.

- [ ] **Step 6: Run existing Editor tests**

```bash
npx vitest run tests/components/Editor.test.tsx
```

Expected: all 12 existing tests still pass — they don't assert on the `h-full` class.

- [ ] **Step 7: Commit**

```bash
git add components/Editor.tsx
git commit -m "feat(AI-36): Editor gains optional 'nested' prop

When nested, the form drops h-full and the inner field block drops
flex-1/overflow-y-auto so the parent scroll container takes over.
Used by EpicTaskEditor where the Editor is embedded inside a larger
column whose own scroll is the right boundary.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: EpicTaskEditor passes `nested`

**Files:**
- Modify: `components/epic/EpicTaskEditor.tsx`
- Modify: `tests/components/epic/EpicTaskEditor.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `tests/components/epic/EpicTaskEditor.test.tsx` (inside the existing `describe`):

```tsx
it("passes nested=true to the embedded Editor (no h-full on the form)", () => {
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
  // The Editor renders a <form>. With nested=true, that form should NOT have
  // h-full in its class list.
  const form = document.querySelector("form");
  expect(form).toBeTruthy();
  expect(form!.className.includes("h-full")).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/components/epic/EpicTaskEditor.test.tsx -t "nested"
```

Expected: FAIL — Editor's form still has `h-full` because EpicTaskEditor doesn't pass `nested`.

- [ ] **Step 3: Pass `nested` to the embedded Editor**

Open `components/epic/EpicTaskEditor.tsx`. Find the `<Editor ... />` JSX (mid-file). Add the `nested` prop:

```tsx
      <Editor
        key={`${taskId}:${refreshKey}`}
        namespace={epicTaskNamespace(taskId)}
        onFinalize={() => {}}
        hideSubmit
        nested
        onClear={onClear}
        onDraftChange={(d) => onTitleChange(d.title)}
      />
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/components/epic/EpicTaskEditor.test.tsx
```

Expected: PASS (the new test + all existing).

- [ ] **Step 5: Commit**

```bash
git add components/epic/EpicTaskEditor.tsx tests/components/epic/EpicTaskEditor.test.tsx
git commit -m "feat(AI-36): EpicTaskEditor sets nested on the embedded Editor

Drops the Editor's h-full + inner flex-1/overflow-y-auto so the outer
scroll container (the EpicEditingView editor pane) manages overflow.
Fixes the description-editor overlap with the AC field that was
caused by competing scroll containers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: RichTextDescription placeholder uses absolute positioning

**Files:**
- Modify: `components/RichTextDescription.tsx`

- [ ] **Step 1: Wrap EditorContent in a relative container**

Open `components/RichTextDescription.tsx`. Find the JSX block (around line 222):

```tsx
        <EditorContent
          editor={editor}
          data-input
          aria-label={label}
        />
        {editor && editor.isEmpty && (
          <p
            className="pointer-events-none -mt-[260px] px-3 pt-3 text-ink-tertiary text-hig-body italic"
            aria-hidden
          >
            {placeholder ?? "Start typing…"}
          </p>
        )}
```

Replace with:

```tsx
        <div className="relative">
          <EditorContent
            editor={editor}
            data-input
            aria-label={label}
          />
          {editor && editor.isEmpty && (
            <p
              className="pointer-events-none absolute inset-0 px-3 pt-3 text-ink-tertiary text-hig-body italic"
              aria-hidden
            >
              {placeholder ?? "Start typing…"}
            </p>
          )}
        </div>
```

The placeholder now overlays its EditorContent via `absolute inset-0` instead of `-mt-[260px]`.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: TYPECHECK_OK.

- [ ] **Step 3: Run existing RichTextDescription / Editor tests**

```bash
npx vitest run tests/components/Editor.test.tsx
```

Expected: green. The placeholder visibility is unchanged; only the positioning mechanism changed.

- [ ] **Step 4: Commit**

```bash
git add components/RichTextDescription.tsx
git commit -m "fix(AI-36): RichTextDescription placeholder uses absolute positioning

Replaces the brittle -mt-[260px] negative-margin hack with a relative
parent + absolute inset-0 placeholder. Robust against any editor
height — the placeholder always overlays its EditorContent without
bleeding into siblings.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: HelpPanel sizing becomes flexible

**Files:**
- Modify: `components/HelpPanel.tsx`

- [ ] **Step 1: Replace the fixed width**

Open `components/HelpPanel.tsx`. Find the outer `<aside>` element (around line 184). Currently:

```tsx
    <aside
      aria-label="Help"
      className="sticky top-0 self-start border-l border-rule w-[400px] h-screen flex flex-col bg-surface overflow-hidden"
    >
```

Replace with:

```tsx
    <aside
      aria-label="Help"
      className="sticky top-0 self-start border-l border-rule min-w-[340px] max-w-[480px] flex-shrink-0 h-screen flex flex-col bg-surface overflow-hidden transition-[max-width,min-width] duration-150 ease-out"
    >
```

Drops the fixed `w-[400px]`, adds `min-w-[340px] max-w-[480px] flex-shrink-0` so it adapts when squeezed, and gains a soft transition.

- [ ] **Step 2: Run HelpPanel tests**

```bash
npx vitest run tests/components/HelpPanel.test.tsx
```

Expected: green — the tests don't assert on the width class.

- [ ] **Step 3: Run the broader test sweep**

```bash
npx vitest run tests/components
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add components/HelpPanel.tsx
git commit -m "style(AI-36): HelpPanel adapts width instead of fixed 400px

min-w-[340px] max-w-[480px] flex-shrink-0 + a soft 150ms transition
on max/min-width. The panel now resizes smoothly when its sibling
columns open/close, and shrinks down to 340px on narrower viewports
instead of forcing horizontal overflow.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: EpicEditingView widths + transitions

**Files:**
- Modify: `components/epic/EpicEditingView.tsx`

- [ ] **Step 1: Tighten cards column widths**

Open `components/epic/EpicEditingView.tsx`. Find the `cardsCols` variable (currently uses `flex-[0.8] min-w-[400px] max-w-[560px]` when closed and `w-[420px]` when open). Replace with:

```ts
const cardsCols = props.analyzePanelOpen
  ? "flex-[0.6] min-w-[340px] max-w-[420px] shrink-0 transition-[flex-basis,max-width,min-width] duration-150 ease-out"
  : "flex-[0.8] min-w-[400px] max-w-[560px] shrink-0 transition-[flex-basis,max-width,min-width] duration-150 ease-out";
```

When the analyze panel opens, the cards column narrows to 340–420; when it closes, it grows back to 400–560.

- [ ] **Step 2: Add soft transition to the editor pane**

In the same file, find the editor pane container `<div className="flex-1 min-w-0 overflow-y-auto">`. Replace with:

```tsx
        <div className="flex-1 min-w-0 overflow-y-auto transition-[flex-basis] duration-150 ease-out">
```

- [ ] **Step 3: Typecheck + tests**

```bash
npx tsc --noEmit
npx vitest run tests/components/epic/EpicEditingView.test.tsx
```

Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add components/epic/EpicEditingView.tsx
git commit -m "style(AI-36): tighten EpicEditingView cards width + soft transitions

Cards column narrows to flex-[0.6] min-w-[340px] max-w-[420px] when
the analyze HelpPanel opens (was w-[420px]), and grows back to
flex-[0.8] min-w-[400px] max-w-[560px] when it closes. Both the
editor pane and the cards column get a 150ms transition on their
flex-basis / max-width so the reflow on panel toggle feels smooth.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: BakeView drops the max-w-4xl wrapper

**Files:**
- Modify: `components/epic/bake/BakeView.tsx`

- [ ] **Step 1: Drop the max-w-4xl wrapper around TaskGraph**

Open `components/epic/bake/BakeView.tsx`. Find the Epic-overview branch (when `!selectedTask`). It currently wraps the TaskGraph in `<div className="p-6 max-w-4xl">`. Replace with `<div className="p-6">`:

```tsx
  ) : (
    <div className="p-6">
      <h2 className="text-hig-title3 mb-3">Epic overview</h2>
      <TaskGraph tasks={props.tasks} />
    </div>
  )
```

- [ ] **Step 2: Run BakeView tests**

```bash
npx vitest run tests/components/epic/bake/BakeView.test.tsx
```

Expected: green — the test doesn't assert on the wrapper class.

- [ ] **Step 3: Commit**

```bash
git add components/epic/bake/BakeView.tsx
git commit -m "style(AI-36): BakeView Epic overview fills its main pane

Drops the p-6 max-w-4xl wrapper around the TaskGraph so the diagram
uses the full available width. The diagram already does its own
max-width via mermaid's useMaxWidth init directive.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: StandaloneApp single-mode-idle layout (the big one)

**Files:**
- Modify: `components/StandaloneApp.tsx`

This is the largest task. It restructures the single-mode-idle render branch so the body is one `flex min-h-0` row that hosts the editor + side aside(s). The editor's `max-w-5xl mx-auto` cap applies only when no side panel is visible.

- [ ] **Step 1: Read the existing render branch**

Open `components/StandaloneApp.tsx` and locate the `else` arm of the existing render conditional (around line 1027 — the `epicMode && epicTasks.length > 0 ? <EpicEditingView /> : (...)` else). Currently:

```tsx
) : (
  <div className="px-6 py-4 flex-1 min-h-0 flex flex-col w-full">
    {submitErr && (
      <div className="mb-3 rounded-md bg-danger/5 border border-danger/30 px-4 py-2.5 shrink-0" role="alert">
        <p className="text-hig-footnote text-danger">{submitErr}</p>
      </div>
    )}
    <div className="flex-1 min-h-0 flex gap-4">
      <div className="flex-1 min-w-0 overflow-y-auto max-w-5xl">
        {epicMode && knead.status !== "idle" && (
          <BackBar … />
        )}
        <Editor
          key={`standalone:${taskRefreshKey}`}
          namespace={NAMESPACE}
          ...
        />
        {epicMode && doughIsStale && !showLostDough && ( … )}
        {epicMode && showLostDough && ( … )}
      </div>
      {epicMode && knead.rounds.length > 0 && (
        <aside aria-label="Captured context" className="w-[320px] shrink-0 border-l border-rule pl-4 overflow-y-auto">
          <CapturedContext rounds={knead.rounds} />
        </aside>
      )}
    </div>
  </div>
)
```

The HelpPanel and KneadingPanel are NOT inside this branch — they're rendered as separate siblings at the bottom of the JSX tree (the outermost `<main>` grid). So when Help or kneading is open, the single-mode-idle layout doesn't currently know about them.

To enable the "drop the cap when any side panel is visible" rule, we need to either:
(a) move HelpPanel + KneadingPanel into this branch as flex siblings, OR
(b) compute a boolean `hasSidePanel` and apply the cap conditionally, leaving the panels where they are.

Option (b) is simpler and avoids ripple effects. Going with (b).

- [ ] **Step 2: Compute the `hasSidePanel` boolean**

Just before the render `return` (near the other derived values like `pendingEdits`), add:

```tsx
// Layout rule: the editor pane caps + centers ONLY when no side panel is on
// screen. Help, kneading, captured-context, and analyze panels all qualify.
const hasSidePanel =
  helpOpen != null ||
  knead.status !== "idle" ||
  knead.rounds.length > 0 ||
  analyzeTaskId != null;
```

- [ ] **Step 3: Apply the conditional cap on the editor wrapper**

Change the editor wrapper (the `<div className="flex-1 min-w-0 overflow-y-auto max-w-5xl">`) to:

```tsx
      <div
        className={
          "flex-1 min-w-0 overflow-y-auto transition-[max-width] duration-150 ease-out " +
          (hasSidePanel ? "" : "max-w-5xl mx-auto")
        }
      >
```

When a side panel is visible, the editor stretches naturally (`flex-1 min-w-0`). When alone, it caps at `max-w-5xl` and centers via `mx-auto`. A soft 150ms transition smooths the change.

- [ ] **Step 4: Typecheck + smoke**

```bash
npx tsc --noEmit
```

Expected: TYPECHECK_OK.

```bash
npx vitest run
```

Expected: green (with the existing 3 .skip'd tests).

- [ ] **Step 5: Commit**

```bash
git add components/StandaloneApp.tsx
git commit -m "feat(AI-36): single-mode-idle editor un-caps when a side panel is open

The single-mode-idle editor wrapper now drops its max-w-5xl mx-auto
cap whenever helpOpen, knead, captured-context, or analyze panels are
visible. Without panels (idle single-mode), the editor stays centered
with the original cap so the form doesn't sprawl on wide screens.
Soft 150ms transition smooths the resize.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Final verification

**Files:** none

- [ ] **Step 1: Full suite**

```bash
npx vitest run
```

Expected: green except the 3 pre-existing .skip'd tests from the earlier reviewer-mode removal phase.

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

- [ ] **Step 4: Smoke checklist via `pnpm dev`**

Walk through each phase and visually verify:

1. **Single mode idle, no Help** — Editor centered with gutters on both sides (max-w-5xl).
2. **Single mode idle, Help open** — Editor stretches to fill, Help on the right, no gutters between them.
3. **Switch to Epic mode, type description, click Knead tasks** — Editor expands (no gutter), KneadingPanel on the right.
4. **Answer a round** — CapturedContext aside appears between Editor and KneadingPanel; smooth reflow.
5. **Click Generate sub-tasks** — transition to EpicEditingView. Editor + Cards, no gutters.
6. **Open Analyze all** — Cards narrow, HelpPanel appears as third column. Smooth.
7. **Close Analyze (Close button on HelpPanel)** — Cards grow back to full width.
8. **Click a sub-task card** — the active editor's Description field does NOT overlap the Acceptance criteria below. (The fix from Tasks 1–3.)
9. **Click Bake** — cards flip baking/baked; reflow smooth.
10. **Bake view: Epic overview** — TaskGraph (or Epic Preview) fills the main pane, no gutter.
11. **Bake view: select a task** — Preview fills, no gutter.

If anything looks off, surface to the user.

- [ ] **Step 5: No commit**

Verification only.

---

## Self-review checklist

- **Spec coverage:**
  - §1 layout rule → Task 7 (conditional cap) + Tasks 4/5/6 (panel sizing).
  - §2 per-phase table → all phases covered by Tasks 4 (Help), 5 (EpicEditingView), 6 (BakeView), 7 (single-mode-idle).
  - §3 file changes → matches Tasks 1–7 one-to-one.
  - §4 soft transitions → added in Tasks 4, 5, 7.
  - §5 description-editor fix → Tasks 1, 2, 3.
  - §6 acceptance criteria → verified in Task 8.
- **Placeholder scan:** No "TODO" / "fill in" in the plan.
- **Type consistency:** The `nested` prop on Editor is consistently spelled across Tasks 1, 2. The `cardsCols` class strings match the spec table.
- **Commit hygiene:** every commit ends with the trailer; every commit uses targeted `git add`; no commit touches `prompts/types/*`.
