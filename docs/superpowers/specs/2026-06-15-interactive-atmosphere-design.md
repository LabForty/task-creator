# Interactive Atmosphere — Making Every Surface Feel Alive

**Date:** 2026-06-15
**Author:** Erkan Rasim (with Claude)
**Branch:** `feat/design-polish` (continues the sign-in-grade polish initiative)
**Follows:** `2026-06-15-design-polish-design.md` (foundation: tokens, AmbientBackground, BrandMark, prominent CTA, glass, motion)

## Summary

The design-polish work made every surface *crafted and consistent*. This effort makes the
empty spaces *alive* — adding subtle, login-grade interactivity and atmosphere wherever the
app currently has voids: the blank editor, the no-diagrams preview, the drafts list, the
app background, cards/panels, and the primary CTAs.

The bar is the sign-in page (cursor spotlight, rotating typewriter headline, breathing brand
mark, aurora). The **tone is elegant & subtle** — "alive but never distracting." A few
delightful moments (a success flourish, one brand-mark easter egg, a barely-there magnetic
CTA) are included but deliberately restrained. Everything is **reduced-motion safe** and
**performance-conscious** (pointer handlers are passive and rAF-throttled; nothing animates
on a hot path).

## Decisions (locked during brainstorming)

| Decision | Choice |
| --- | --- |
| Feature set | Signature (#1 spotlight, #3 reactive aurora, #5 typewriter prompts, #6 ghost diagram, #10 success flourish) + delight/functional (#9 magnetic CTA, #11 easter egg, #12 icon hovers, #13 draft peek, #14 readiness hint, #15 diagram-type preview, #16 shortcut hints) |
| Tone | **Elegant & subtle (login-grade)** — playful items tuned down, not loud |
| Readiness hint (#14) | **Simple client-side completeness** — title + description length ≥ threshold + ≥1 acceptance criterion |
| Scope | **All, phased** — one spec, four phases, reviewed per phase |
| Motion policy | All interactions honor `prefers-reduced-motion` (via global rule + `MotionConfig reducedMotion="user"`); pointer handlers passive + rAF-throttled |

## Architecture

Foundation-first, mirroring the polish branch: a small set of **reusable interaction
primitives** (hooks + components + CSS), then **per-surface application**, in four phases.

### Foundation primitives (new, unit-tested)

| Unit | Location | Purpose / interface |
| --- | --- | --- |
| `useSpotlight` + `.spotlight` CSS | `lib/interaction/useSpotlight.ts`, `app/globals.css` | Generalizes the sign-in card's cursor-tracking accent glow. Hook returns a `ref<HTMLElement>`; on `pointermove` (rAF-throttled, passive) it sets `--spot-x/--spot-y` CSS vars on the element. `.spotlight` adds the `::before` radial accent glow (extracted from `.signin-card::before`). Reduced-motion: glow stays centered/static. (#1) |
| `useMagneticHover` | `lib/interaction/useMagneticHover.ts` | Hook returns a `ref`; while the pointer is over the element, translate it toward the cursor by a damped amount capped at **6px**, easing back to 0 on leave. Reduced-motion: no-op. For prominent CTAs only. (#9) |
| `Typewriter` | `components/ui/Typewriter.tsx` | Extracts the sign-in rotating-headline state machine (type → hold → delete → next). Props: `phrases: string[]`, optional speeds, `onAdvance?`. Renders the typed text + a blinking caret. Reduced-motion: shows the first (or current) phrase statically, no typing. (#5) |
| `GhostDiagram` | `components/ui/GhostDiagram.tsx` | A faint, `aria-hidden` SVG wireframe (nodes + edges) that self-draws on a loop via `stroke-dashoffset`. Decorative placeholder for the no-diagrams state. Reduced-motion: renders the completed static wireframe (no draw loop). (#6) |
| `SuccessFlourish` | `components/ui/SuccessFlourish.tsx` | A restrained one-shot flourish (a soft expanding accent ring + a few sparks, ~600ms) that plays once on mount. NOT confetti. Reduced-motion: falls back to the existing `celebrate` opacity/scale beat only. (#10) |
| Aurora `tone` | `components/AmbientBackground.tsx` + `app/globals.css` | `AmbientBackground` gains an optional `tone?: "idle" | "running" | "success"` prop applied as `data-tone`; CSS transitions the aurora tint: `idle` (current), `running` (faint accent shimmer — slightly brighter/cooler), `success` (brief green wash). Transition ~500ms. (#3) |
| Icon-hover CSS | `app/globals.css` | Small `.icon-hover-*` classes (e.g. export arrow nudges up, diagram boxes draw) applied to the existing inline SVG glyphs. Reduced-motion: no transform. (#12) |

### Per-surface application

| Surface | Additions |
| --- | --- |
| **Cards & glass panels** | `useSpotlight` + `.spotlight` on the editor card, glass panels, and draft cards (#1) |
| **Prominent CTAs** | `useMagneticHover` on `prominent` buttons (Finalize, Export, etc.) (#9) |
| **App shells** | `AmbientBackground tone` wired from app state in `StandaloneApp`/`EmbedApp`: `running` during a finalize run, `success` for ~1.5s after finalize/export success, else `idle` (#3) |
| **Blank editor** | `Typewriter` idea-prompts (rotating clickable examples that prefill the description) (#5); **readiness hint** in the empty side-margin (#14); fade-in shortcut chips (#16) |
| **Preview (no diagrams)** | `GhostDiagram` in the empty state (#6); diagram-type hover preview on the flow/sequence/interaction control (#15) |
| **Drafts list** | hover-to-peek: hovering a `DraftCard` expands a mini content preview (#13) |
| **Header / brand** | brand-mark easter egg — a few clicks trigger one tasteful bloom (#11); icon hovers on header glyphs (#12) |
| **Export / finalize success** | `SuccessFlourish` on the JiraExport success view and the RunSheet finalized beat (#10) |

### Readiness hint (#14) — definition

A subtle indicator (a thin 3-segment meter or progress bar) shown in the editor's empty side
margin (only when no side panel is open and the draft is non-blank). Fills based on a pure
client-side heuristic:

1. Title present (non-whitespace)
2. Description length ≥ a small threshold (e.g. ≥ 40 visible chars)
3. ≥ 1 non-empty acceptance criterion

Label reads "Ready to finalize" when all three are met. No AI, no network — derived from the
live draft via a small `lib/draft/readiness.ts` helper (`readinessScore(draft): 0..3`). Hidden
entirely when reduced-motion? No — it's not motion; it stays, but its fill transition is
instant under reduced-motion.

## Phases

One spec, four phases (each independently shippable + screenshot/interaction-reviewed):

1. **Foundation** — `useSpotlight` (+ `.spotlight` CSS), `useMagneticHover`, `Typewriter`,
   `GhostDiagram`, `SuccessFlourish`, `AmbientBackground` `tone` prop (+ CSS), icon-hover CSS,
   `readinessScore` helper. Unit tests for each. No surface wiring yet.
2. **Ambient & spotlight (the alive layer)** — apply `.spotlight`/`useSpotlight` to cards &
   glass panels (#1); `useMagneticHover` on prominent CTAs (#9); wire `AmbientBackground tone`
   from app state in the shells (#3); icon hovers (#12); brand-mark easter egg (#11).
3. **Empty-state heroes** — `Typewriter` idea-prompts + prefill in the blank editor (#5);
   `GhostDiagram` in the no-diagrams preview (#6); diagram-type hover preview (#15).
4. **Functional-delight** — draft card hover-peek (#13); readiness hint (#14); shortcut
   hints (#16); `SuccessFlourish` on export/finalize success (#10).

## Tone calibration (elegant & subtle)

- **Success (#10):** one soft expanding ring + a few sparks, ~600ms, accent/success-tinted —
  not a confetti storm.
- **Magnetic CTA (#9):** ≤6px pull, eased; barely perceptible, just enough to feel responsive.
- **Easter egg (#11):** a single tasteful bloom on the diamond after N clicks; no sound, no
  persistent state. The least essential item — droppable if it ever feels gimmicky.
- **Spotlight (#1):** low-opacity accent glow (mirrors sign-in's 0.18/0.28), large radius.
- **Reactive aurora (#3):** tint *shifts*, never flashes; 500ms eased transitions; the
  success wash is brief and gentle.

## Testing strategy

- **Unit tests** for each primitive: `useSpotlight` (sets CSS vars on pointermove; static
  under reduced-motion), `useMagneticHover` (translates within cap; resets on leave; no-op
  under reduced-motion), `Typewriter` (cycles phrases; renders static first phrase under
  reduced-motion — note jsdom sets `MotionGlobalConfig.skipAnimations`), `GhostDiagram`
  (renders, `aria-hidden`), `SuccessFlourish` (renders, plays once, reduced-motion fallback),
  `AmbientBackground` (`data-tone` reflects the prop), `readinessScore` (0..3 across cases).
- **Reduced-motion:** assert the reduced-motion fallbacks (static spotlight, no magnetic
  translate, no typing, static ghost diagram, no spark) — the global rule + `reducedMotion="user"`.
- **Performance:** pointer handlers must be `{ passive: true }` and rAF-throttled; no layout
  thrash. Reviewed in code, not a unit test.
- **Regression:** full vitest + `npm run typecheck` + `npm run lint` (`check:tokens` clean —
  any new colour lives in the `globals.css` token layer) + `npm run build` + e2e (styleguide
  + drafts) stay green each phase.
- **/styleguide:** add live demos of the new primitives (spotlight card, typewriter, ghost
  diagram, success flourish, the reactive-aurora tones) so they're documented and tweakable.
- **Interaction review:** the user verifies feel/perf in the running app each phase (Claude
  cannot run a browser). This is the real acceptance gate for "elegant & subtle."
- **Docs:** extend `docs/design-system.md` (interaction primitives + tone guidance) and add a
  `CHANGELOG` entry.

## Out of scope

- Functional/behavioural changes beyond the readiness heuristic and the prefill action
  (clicking a typewriter prompt inserts text). No new flows.
- Sound, haptics, persistent easter-egg state, or analytics.
- Heavy/3D effects, canvas particle systems — the success flourish is lightweight SVG/CSS.
- Animating the ambient aurora's *drift* (the polish branch kept it static; reactive *tint*
  is in scope, continuous *motion* is not — can be a follow-up if desired).

## Risks

- **Distraction / performance** — mitigated: subtle by design, reduced-motion safe, passive +
  rAF-throttled pointer handlers, no continuous app-wide animation loops.
- **Legibility** — spotlight/aurora are low-opacity; content surfaces stay glass-strong.
- **Scope (12 touches)** — mitigated by foundation-first phasing; each phase ships and is
  interaction-reviewed independently; the easter egg is explicitly droppable.
- **Cannot self-verify feel** — Claude can't run a browser; the per-phase interaction review
  by the user is the acceptance gate, especially for "elegant vs. distracting" calibration.
