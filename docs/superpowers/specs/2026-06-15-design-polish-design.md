# Design Polish — Bring Every Surface Up to the Sign-in Standard

**Date:** 2026-06-15
**Author:** Erkan Rasim (with Claude)
**Branch:** `feat/design-polish`
**Follows:** AI-51 design unification (merged) — `docs/superpowers/specs/2026-06-12-ai-51-design-unification-design.md`

## Summary

AI-51 made every surface *consistent and tokenized*. This effort makes them feel
*as crafted as the sign-in page*. A visual review (light + dark screenshots of
`/signin`, `/`, `/drafts`, `/styleguide`) showed the working surfaces are flatter
than the sign-in page: no atmospheric depth, no brand mark in the app header,
plainer hierarchy, and no signature motion. A WCAG contrast audit of the token
palette also surfaced real AA shortfalls (see below).

This spec adds the missing craft as a **shared foundation** (depth, brand,
prominent CTA, motion, accessible colour tokens) and applies it across **every**
surface, while preserving the "calm surfaces" principle (dense panels stay
legible — depth is ambient, not loud).

## Decisions (locked during brainstorming)

| Decision | Choice |
| --- | --- |
| Scope | **Everything** — home, editor, drafts, epic-mode screens, all panels/sheets, embed variant, and all empty/error/loading states |
| Depth intensity | **Subtle / calm** — a faint, static aurora-tinted background behind the app shell; panels stay `glass-strong` and legible |
| Contrast fix | **Surgical accessible tokens** — keep vivid `accent`/`danger` for fills/tints; add darker `*-strong` variants for colour-as-text and button fills |
| Motion | **Included** — success beats, single↔epic transition, refined entrances; reduced-motion safe |
| Approach | **Foundation-first, then per-surface**, phased (mirrors AI-51) |

## Contrast audit (baseline) and the fix

`scripts/contrast-check.mjs` (from AI-51) measured the token pairs. Light-mode AA
(4.5 normal-text) failures, all of which pass the 3.0 large/UI bar:

| Pair (light) | Ratio | Used for |
| --- | --- | --- |
| white on `accent` (#007aff) | 4.02 | primary/CTA button labels |
| `accent` on surface | 4.02 | ghost buttons, links |
| `danger` (#ff3b30) on surface | 3.55 | error text |
| `ink-tertiary` (#86868b) on surface | 3.62 | eyebrow/caption labels |

Dark mode passes except white-on-`accent` (#0a84ff = 3.65). These are inherent to
the Apple-HIG palette and the sign-in page shares them.

**Fix — new/changed tokens (all values verified ≥ AA 4.5 by the script):**

| Token | Light | Dark | Used for |
| --- | --- | --- | --- |
| `--color-accent-strong` (new) | `#0064d6` (white-on-fill 5.54) | `#0a72ec` (white-on-fill 4.53) | primary + `prominent` button background (white labels) |
| `--color-accent-link` (new) | `#0064d6` (text-on-surface 5.54) | `#0a84ff` (text-on-surface 4.66) | accent-as-text (ghost buttons, links) |
| `--color-danger-strong` (new) | `#d70015` (5.38) | `#ff453a` (4.99) | error text (`Alert`, field errors) |
| `--color-ink-tertiary` (changed, light only) | `#76767b` (4.52) | `#8e8e93` (unchanged, 5.22) | eyebrow/caption labels |

The accent splits into **two** tokens because in dark mode no single value clears
*both* white-on-fill AA (which needs a darker blue, `#0a72ec`) and accent-as-text
AA on the surface (which needs a lighter blue, `#0a84ff`). `accent-strong` carries
fills; `accent-link` carries colour-as-text. (In light mode both are `#0064d6`,
but they stay distinct tokens so the dark split is expressible.)

Vivid `accent` (#007aff / #0a84ff) and `danger` (#ff3b30 / #ff453a) are retained
for **fills, tints, borders, icons, focus rings, and the aurora**. Only
colour-as-text moves to `accent-link` / `danger-strong`, and white-on-accent
button fills move to `accent-strong`. The sign-in CTA adopts `accent-strong` too
(still clearly brand-blue, now AA).

Tailwind mapping (in `tailwind.config.ts`): `accent.strong → var(--color-accent-strong)`,
`accent.link → var(--color-accent-link)`, `danger.strong → var(--color-danger-strong)`.

## Architecture / phased plan

One spec, six phases. Foundation (Phase 1) ships first; surfaces follow.

### Phase 1 — Foundation: tokens, depth, brand, CTA, motion

1. **Accessible tokens** — add `--color-accent-strong` / `--color-danger-strong`
   to `:root` and `html.dark` in `app/globals.css`; bump light `--color-ink-tertiary`;
   map `accent.strong` / `danger.strong` in `tailwind.config.ts`.
2. **`Button` updates** (`components/ui/Button.tsx`) — `primary` variant background
   → `accent-strong`; `ghost` text → `accent-strong`; add a **`prominent`** variant
   (the sign-in CTA treatment: `accent-strong` bg, white label, sheen, `shadow-card`,
   `active:scale`). `Alert` danger text → `danger-strong`; `TextField` error text →
   `danger-strong`.
3. **`AmbientBackground`** (`components/AmbientBackground.tsx`) — a static, dim,
   token-tinted aurora/radial layer (`-z-10`, `pointer-events-none`) for the app
   shell. Derived from the sign-in aurora vocabulary but much dimmer and
   non-animated. CSS lives in a `app/globals.css` `.ambient-*` block.
4. **`BrandMark`** (`components/BrandMark.tsx`) — extract `LabFortyMark` from
   `components/signin/SigninExperience.tsx`; sign-in imports it from the new home
   (no visual change there). `BRAND_RED` const moves with it (keeps its
   `design-tokens-allow` marker).
5. **Motion** (`lib/motion.ts`) — add a `celebrate`/success variant and a
   `crossFade`/transition helper; keep `reducedMotion="user"` global behaviour.

### Phase 2 — App shell + header (home, embed)

- `components/StandaloneApp.tsx` + `components/EmbedApp.tsx`: render
  `AmbientBackground` behind the grid; add `BrandMark` to the header; promote the
  Finalize action to the `prominent` Button variant. Embed keeps a lighter shell
  (no heavy chrome) but inherits brand + tokens.

### Phase 3 — Editor

- `components/Editor.tsx`: stronger hierarchy (page-level heading scale, spacing
  rhythm), and a **hero empty state** for a blank draft (glass card on ambient bg,
  inviting headline + primary action) instead of an empty form void.

### Phase 4 — Drafts

- `components/drafts/*`: a **hero empty state** ("No drafts yet" → glass-card-on-
  ambient with `hig-large` headline + `prominent` CTA), and **shimmer** loading
  skeletons (replace the static pulse).

### Phase 5 — Preview / diagram / panels + epic mode

- `components/Preview.tsx`, `DiagramView.tsx`, `AnalyzePanel.tsx`, `RunSheet.tsx`,
  `HelpPanel.tsx`, `JiraExport.tsx`: consistent `glass-strong` surfaces over the
  ambient bg; Export-to-Jira uses `prominent`; success beat on export.
- `components/epic/**`: bring epic-mode screens (editing, bake, review, kneading)
  to the same standard — brand-consistent headers, glass-strong panels, the
  single↔epic transition, hierarchy.

### Phase 6 — Empty / error / loading states everywhere

- Audit remaining empty/error/loading states across all surfaces; apply the hero
  treatment for empties and shimmer for loaders. Confirm `Alert`/`danger-strong`
  used for all error text.

## Components / interfaces (new + changed)

| Unit | Location | Purpose |
| --- | --- | --- |
| `AmbientBackground` | `components/AmbientBackground.tsx` | Static dim aurora layer for the app shell |
| `BrandMark` | `components/BrandMark.tsx` | Shared LabForty diamond mark (extracted) |
| `prominent` variant | `components/ui/Button.tsx` | Marquee CTA treatment (sheen) |
| `accent-strong` / `accent-link` / `danger-strong` | `globals.css` + `tailwind.config.ts` | AA-compliant button fills (`accent-strong`), accent-as-text (`accent-link`), error text (`danger-strong`) |
| `celebrate` / transition helpers | `lib/motion.ts` | Signature motion beats |

## Testing strategy

- **Contrast regression guard:** extend `scripts/contrast-check.mjs` to assert the
  active token pairs (including the new `*-strong` for text/buttons) all clear AA,
  and add `tests/scripts/contrast.test.ts` importing its ratio helper to lock the
  thresholds. Optionally wire `contrast-check` into `lint` alongside `check:tokens`.
- **Visual review:** before/after screenshots (light + dark) per surface via a
  capture script (the AI-51 capture approach), reviewed each phase.
- **Unit tests:** `BrandMark`, `AmbientBackground` (renders, `aria-hidden`,
  `pointer-events-none`), and the `prominent` Button variant.
- **Regression:** full vitest suite + `npm run typecheck` + `npm run lint`
  (`check:tokens` stays clean — new hex live only in the `globals.css` token layer)
  + `npm run build` + e2e (styleguide + drafts) stay green each phase.
- **`/styleguide`:** extend it to show the `prominent` variant, the `*-strong`
  tokens, and the `AmbientBackground` so the additions are documented live.
- **Docs:** update `docs/design-system.md` (new tokens, `prominent`, depth/brand
  guidance) and add a `CHANGELOG` entry.

## Out of scope

- Functional/behavioural changes (this is visual + tokens + motion).
- New layout/IA — surfaces keep their structure; we add depth, hierarchy, brand,
  and accessible colour, not rebuild flows.
- The deferred AI-51 multi-browser e2e (separate follow-up).

## Risks

- **Legibility from depth** — mitigated: ambient bg is dim + static; panels stay
  `glass-strong`.
- **`accent-strong` shifts the brand blue slightly darker on buttons/CTA incl.
  sign-in** — intended (AA), verified visually via screenshots; vivid `accent`
  remains for tints/aurora so the overall feel is preserved.
- **Scope ("everything") is large** — mitigated by foundation-first phasing; each
  phase is independently shippable and screenshot-reviewed.
