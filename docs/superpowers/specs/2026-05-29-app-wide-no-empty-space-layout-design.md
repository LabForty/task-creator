# App-wide no-empty-space layout + description-editor fix

**Ticket:** AI-36 follow-up polish.
**Date:** 2026-05-29.
**Status:** Approved, ready for implementation plan.

## Description

Two coordinated changes:

1. **Layout uniformity** — across every phase of the app (single-task idle / finalized / exporting; epic kneading / editing / baked), the body is a single flex row. The primary content pane (Editor / Preview / BakeView) takes `flex-1` and stretches to fill whatever horizontal space is unused by side panels. Side panels (Help, Kneading, Captured-context, EpicEditingView cards, BakeNav) are flex siblings with their own `min-w / max-w` bounds. When a panel closes, the primary pane reclaims its width via flex; when one opens, primary narrows.

   **The exception is single-mode-idle with no side panels visible.** There the Editor stays centered with a `max-w-5xl mx-auto` cap so the form doesn't sprawl across an empty screen. Once ANY side panel opens (Help, kneading, captured-context), the cap drops and the Editor stretches.

2. **Description-editor overlap fix** — when a sub-task card is selected in EpicEditingView, the embedded Editor's Description (TipTap) bleeds out of its allotted vertical space and overlaps the Acceptance criteria field below it. Two root causes: the Editor's form uses `h-full` in a context where the parent doesn't constrain height; and the RichTextDescription placeholder hack uses negative margin (`-mt-[260px]`) which breaks when the editor's actual height differs from the assumed 260px.

## Decisions

1. **One layout rule** — primary pane `flex-1 min-w-0` always; side panels are flex children with `shrink-0` + their own min/max widths. Editor's `max-w-5xl mx-auto` applies only in single-mode-idle with NO side panel visible.
2. **No resizable drag handles** in this pass. Pure CSS flex reflow on mount/unmount.
3. **Soft transition** on flex resize: `transition-[flex-basis,width] duration-150 ease-out` on each primary/secondary pane container.
4. **EpicEditingView Cards column shrinks** (not closes) when the analyze HelpPanel opens. Closed: `flex-[0.8] min-w-[400px] max-w-[560px]`. Open: `flex-[0.6] min-w-[340px] max-w-[420px]`.
5. **HelpPanel** becomes `min-w-[340px] max-w-[480px] flex-shrink-0` (current is fixed `w-[400px]`).
6. **BakeView Epic overview** drops its `max-w-4xl` wrapper — let the TaskGraph fill the main pane.
7. **Description-editor fix**:
   - Add a `nested?: boolean` prop to Editor that drops the form's `h-full` and lets the form grow naturally (so the outer pane handles scrolling).
   - EpicTaskEditor sets `nested` and gives its outer wrapper `flex flex-col gap-4` (no `h-full`).
   - RichTextDescription replaces the negative-margin placeholder with `relative` parent + `absolute inset-0` placeholder. Robust against any container height.

## Architecture

### Layout per phase

| Phase | Layout (left → right) |
|---|---|
| **Single mode idle** (no Help) | Editor (`max-w-5xl mx-auto`) |
| **Single mode idle** (Help open) | Editor (`flex-1`) │ HelpPanel (`min-w-[340px] max-w-[480px]`) |
| **Single mode finalized** | Preview (`flex-1`) |
| **Single mode finalized** (Help open) | Preview (`flex-1`) │ HelpPanel |
| **Single mode exporting** | JiraExport (`flex-1`) |
| **Epic kneading**, no rounds yet | Editor (`flex-1`) │ KneadingPanel (`w-[380px] shrink-0`) |
| **Epic kneading**, has rounds | Editor (`flex-1`) │ CapturedContext (`w-[300px] shrink-0`) │ KneadingPanel |
| **Epic editing** (no Help) | Editor (`flex-1`) │ Cards (`flex-[0.8] min-w-[400px] max-w-[560px]`) |
| **Epic editing** (Help open) | Editor (`flex-1`) │ Cards (`flex-[0.6] min-w-[340px] max-w-[420px]`) │ HelpPanel |
| **Epic baked** | BakeNav (`w-[280px] shrink-0`) │ BakeView main (`flex-1`) |
| **Epic baked** (Help open within BakeView) | BakeNav │ BakeView main (`flex-1`) │ HelpPanel |

In every row above, the primary pane uses `flex-1 min-w-0`. The container is `flex gap-0 min-h-0` (or `gap-4` if visual spacing is needed).

### File changes

- **`components/StandaloneApp.tsx`**: the single-mode-idle Editor container conditionally adds `max-w-5xl mx-auto` only when no side panel is visible. The body becomes one `flex min-h-0` row that hosts the editor pane + each side aside as siblings. The kneading-phase layout uses the same flex pattern (no special-case wrapper).
- **`components/epic/EpicEditingView.tsx`**: drop the `gap-4` outer wrapper if it creates seams; tighten the cards column widths per Decision 4.
- **`components/HelpPanel.tsx`**: replace `w-[400px]` with `min-w-[340px] max-w-[480px] flex-shrink-0`.
- **`components/epic/bake/BakeView.tsx`**: drop the `p-6 max-w-4xl` wrapper around TaskGraph; let it fill.
- **`components/Editor.tsx`**: add `nested?: boolean` prop. When `nested`, drop `h-full` from the form so the parent's scroll container manages overflow.
- **`components/epic/EpicTaskEditor.tsx`**: pass `nested` to the embedded Editor. Outer wrapper stays `flex flex-col gap-4`.
- **`components/RichTextDescription.tsx`**: wrap `<EditorContent>` + empty-placeholder in a `<div className="relative">`. Placeholder uses `absolute inset-0` instead of `-mt-[260px]`.

### Soft transitions

Each primary/secondary pane container gains:

```
transition-[flex-basis,width,max-width] duration-150 ease-out
```

so a panel opening/closing softly animates the reflow. No JS, no library.

### Tests

- Component tests for the layout primarily verify presence/absence of expected wrapper classes — keep these light, focused on the rule "max-w-5xl applied only when no side panel".
- New regression test for the description-editor overlap: in EpicEditingView with an active sub-task, the description's bounding box does not overlap the Acceptance criteria block. jsdom doesn't compute real layouts, so this is best validated manually on `pnpm dev`; the spec-level check is that `Editor` receives `nested` and the form's class list does not include `h-full`.
- Existing tests should continue to pass since this is mostly CSS.

## Acceptance criteria

### Layout

- Across every phase, the body container is a single flex row. Closing any side panel grows the primary content pane via flex reflow.
- Single-mode-idle with no side panel shows the Editor centered with a `max-w-5xl` cap and visible gutters — by design.
- Single-mode-idle with the Help panel open removes the cap and centers; the Editor expands and Help takes its slice on the right.
- Epic-mode-kneading: Editor + KneadingPanel + (when rounds exist) CapturedContext sit side-by-side, no gutters.
- Epic-mode-editing: Editor + Cards always visible; Help joins as a third column when active, cards narrow.
- Epic-mode-baked: BakeNav + main pane; main pane fills.
- Resize between states is animated with a 150 ms transition.

### Description editor

- In EpicEditingView, selecting a sub-task card shows an Editor whose Description text area does not overlap the Acceptance criteria block below.
- The Editor's form no longer relies on `h-full` in the nested context.
- The RichTextDescription placeholder is positioned absolutely (no negative margin) so it always overlays its EditorContent regardless of editor height.

### Tests

- Existing test suite stays green (modulo any tests that asserted on the removed `max-w-5xl` / `h-full` classes — those are updated to the new shape).
- One new unit-ish test in `tests/components/epic/EpicTaskEditor.test.tsx` asserting that the embedded Editor receives `nested={true}` (or equivalent — that the form does not have `h-full`).

## Out of scope

- User-resizable drag handles between panels (separate phase).
- Animated mount/unmount of panel contents (we only animate the flex reflow).
- Always-on secondary panel in single mode (the user explicitly said the editor stays centered when alone).
- Wider Preview redesign (the existing 1-col / lg:2-col grid stays).

## Edge cases

- **Very narrow viewports** (≤900px wide): with multiple panels open, the editor's `min-w-0` allows it to shrink to zero. The side panels' `shrink-0` keeps them at min-width. The cards column may shrink to its `min-w-[340px]` and the editor narrows further. If the viewport is so narrow that the side panels' total `min-w` exceeds the viewport, horizontal overflow appears at the body — accepted, this is below the target device width.
- **Empty knead rounds**: the CapturedContext aside doesn't render at all (existing behavior); editor + KneadingPanel only.
- **Empty cards list**: shouldn't happen in EpicEditingView (the view only renders when `epicTasks.length > 0`); but if forced, cards column collapses to its `min-w-[400px]` showing only the Epic card + Add tile.
