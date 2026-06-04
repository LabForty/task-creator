# App-wide polish + motion system — design

**Date:** 2026-06-04
**Status:** Approved (brainstormed with visual companion; user selected drafts direction "A — Refined list" and motion level "B — Lively")

## Goal

Polish the whole app visually and give it a consistent, lively interaction language — in place, with no fundamental restructuring of screens. The drafts dashboard is the showcase surface; the same vocabulary then lands across the editor, epic mode, and panels/overlays.

## Decisions made during brainstorming

| Question | Decision |
|---|---|
| Drafts panel layout | **A — Refined list**: keep the vertical list, polish every detail (vs. card grid / compact rows) |
| Motion level | **B — Lively**: HIG micro-interactions + staggered entrances + gentle spring overshoot (vs. quiet-only / expressive signin-page energy) |
| Scope | Everything: drafts, main editor, epic views, panels & overlays |
| Restructuring | None — polish existing layouts only |
| Implementation | **Framer Motion** (`motion` package). Chosen for real exit animations and layout reflow (delete a draft → card shrinks/fades, list reflows). Bundle cost is negligible next to React Flow + TipTap + Mermaid. |

## 1. Motion foundation

A single shared module **`lib/motion.ts`** defines the entire motion vocabulary. Every component imports from it; nobody hand-rolls animation values.

- **Durations/easings:** entrances ~250–350ms settle; springs stiff and lightly damped — one subtle overshoot, never bouncy. Micro-states (hover/press) remain CSS at 150ms `ease-hig`.
- **Named variants:** `fadeUp`, `staggerList` (~40ms/item), `liftOnHover`, `scaleIn` (menus, 95%→100%), sheet/panel slide transitions.
- **Reduced motion:** `<MotionConfig reducedMotion="user">` at the app root collapses entrances/exits to instant. The existing global CSS `prefers-reduced-motion` rule stays as backup for CSS transitions.
- **Division of labor:** Framer handles entrances, exits, and layout reflow. CSS keeps handling hover/press micro-states on buttons/inputs (existing `transition-all duration-150 ease-hig` idiom unchanged).

## 2. Drafts panel (direction A — refined list)

Page structure unchanged. Card-level changes:

- **Anatomy:** 3px mode accent edge on the left (accent blue for Epic, `ink-quaternary` gray for Single). Row 1: title + mode chip + relative time. Below: two-line preview. Epic chip gains task count ("Epic · 6 tasks") — data already in the list payload.
- **Hover:** card lifts (−2px, deeper shadow, hairline accent border). Delete/Open actions fade-slide in on hover; always visible on touch devices and keyboard focus.
- **Entrance:** cards stagger in (fade + rise, ~40ms apart) on load.
- **Delete:** replace `window.confirm` with an in-app **confirm popover** anchored to the card. On confirm, the card shrinks/fades out and the list reflows (Framer `AnimatePresence` + `layout`).
- **Whole card clickable** to open the draft (hover actions remain for explicitness). Fixes the nit where only the small Open button navigates.
- **Loading state:** skeleton cards match the real card silhouette. **Empty state:** keeps existing copy and CTA; adds a circular accent-tint medallion with a document glyph (inline SVG, tokens only — no image assets) above the heading, and the card fades-up on mount.

## 3. App-wide application

**Main editor screen**
- Header buttons get shared press/hover micro-states (mostly already present).
- Form sections fade-up once on mount — a single gentle pass, never per-keystroke.
- Preview panel: regenerated content cross-fades instead of popping.

**Epic mode**
- Kneading Q&A: new rounds slide in with spring; answered chips get a press/settle micro-interaction.
- Epic task cards: same hover-lift + stagger language as draft cards. Adding a task animates in; deleting reflows the grid (Framer `layout` on the card list).
- Review/bake: approve/deny status changes animate the chip/color transition. Upload sheet slides up with spring + backdrop dim.

**Panels & overlays**
- Help panel and run sheet: spring slide-in/out instead of instant mount (existing width transitions stay).
- Jira export dropdowns/menus: `scaleIn` from origin, fast.
- One shared styled **`ConfirmPopover`** component replaces all `window.confirm` call sites.
- Jira banner and similar notices: slide down on appear, animated exit on dismiss.

**Theming:** every new color/shadow comes from existing CSS tokens (`globals.css` variables) — nothing hardcoded; must hold up in light and dark.

## 4. Edge cases

- **Reduced motion:** entrances/exits instant; hover lifts become plain state changes.
- **Long lists:** stagger capped — first ~8 items stagger, the rest appear together.
- **Mid-animation unmounts** (fast navigation): `AnimatePresence` handles cleanup.
- **Delete failures:** confirm popover closes on Escape/outside click; failed delete keeps the card in place and surfaces the existing error state.

## 5. Testing

- Motion wrappers preserve DOM structure and roles, so existing `getByRole`-style unit tests keep passing.
- `DraftCard`/`DraftsView` tests updated for new anatomy (accent edge, task count, confirm popover). Tests that mock `window.confirm` are rewritten against the popover.
- E2E: drafts spec gains a delete-via-popover flow. Playwright's stability waiting tolerates the animations.

## 6. Rollout order (each step independently shippable)

1. Install Framer Motion; add `lib/motion.ts` + root `MotionConfig`.
2. Drafts panel full treatment (showcase).
3. Shared `ConfirmPopover`; replace all `window.confirm` call sites.
4. Editor + preview polish.
5. Epic mode views.
6. Panels/sheets/overlays.
