# AI-51 — Unify Task Creator Design with Application Patterns

**Ticket:** [AI-51](https://labforty.atlassian.net/browse/AI-51) · Task · In Progress
**Date:** 2026-06-12
**Author:** Erkan Rasim (with Claude)

## Summary

Align the **task creator** UI with the visual language already established by the
**sign-in page** (`app/signin/` + `components/signin/SigninExperience.tsx`), formalise
the existing design system, and publish a design pattern guide. All design values must
be expressed as **named tokens or utility classes** — no raw hex, no arbitrary `[...]`
values (with a small, documented set of brand/decorative exceptions).

## Context & key finding

The ticket is framed as if the task creator visually *diverges* from the login page. An
audit of the codebase shows the gap is **consistency and documentation, not missing
infrastructure**:

- A mature, HIG-based token system already exists: `tailwind.config.ts` + CSS variables
  in `app/globals.css` define semantic colours (`accent`, `ink`, `surface`, `rule`,
  `danger/warning/success`), a full type ramp (`hig-caption` → `hig-large`), radii,
  shadows (`card`, `elevated`, `focus`), and an `ease-hig` timing function. Dark mode is
  class-based (`darkMode: "class"`) and wired up (pre-paint init in `app/layout.tsx`,
  runtime `components/ThemeToggle.tsx`).
- The sign-in page is the **clean exemplar** — its glass card is built almost entirely
  from those tokens.
- The task creator already uses the same tokens in most places. The concrete deviations
  are contained (see Section 1 hit-list).
- **No design guide and no CHANGELOG exist yet** — so documenting the system is the
  largest net-new deliverable.

## Decisions (locked during brainstorming)

| Decision | Choice |
| --- | --- |
| Workflow | Brainstorm → plan → implement |
| Guide medium | In-repo Markdown (`docs/design-system.md`) **+ a live `/styleguide` route** |
| Code scope | **Full visual redesign** of the task creator, sign-in page as the template |
| Visual treatment | **Design language, calm surfaces** — adopt glass cards, type ramp, accent, CTA buttons, focus rings, `ease-hig` motion everywhere; reserve aurora/glass for light-touch moments (header, empty states); keep dense panels legible |
| Token strategy | **Standardize on existing tokens** + Tailwind's default spacing scale; eliminate all arbitrary `[...]` values and raw hex by mapping onto existing tokens/utilities; add only a couple of new tokens where a genuine gap exists |
| Approach | **Primitive-first** — consolidate `components/ui/` so the language lives in one place, then adopt across surfaces |

## The design language (what the sign-in page establishes)

The authoritative reference. The sign-in card (`components/signin/SigninExperience.tsx`)
expresses:

- **Glass surface:** `rounded-xl border border-rule bg-surface/70 shadow-elevated backdrop-blur-xl`
- **Eyebrow label:** `.hig-section-label` (uppercase, tracked, `text-ink-tertiary`)
- **Headline:** `text-hig-large text-ink`; **body:** `text-hig-subhead text-ink-secondary`
- **Error chip:** `rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-hig-footnote text-danger`
- **CTA button:** `h-12 rounded-lg bg-accent text-white shadow-card hover:bg-accent-hover active:bg-accent-pressed active:scale-[0.99] focus-visible:shadow-focus transition-all duration-150 ease-hig`
- **Motion:** `ease-hig`, ~150ms transitions, subtle active scale; `lib/motion.ts` vocabulary; `reducedMotion="user"` honoured globally.

## Architecture / phased plan

One coherent spec, implemented in four phases.

### Phase 1 — Token layer (foundation)

- Add **`.hig-glass`** and **`.hig-glass-strong`** component classes in
  `app/globals.css`. `.hig-glass` = the sign-in card treatment
  (`border border-rule bg-surface/70 backdrop-blur-xl shadow-elevated`).
  `.hig-glass-strong` raises opacity (≈`bg-surface/85`) for dense panels — this is how
  "calm, legible surfaces" is honoured while still speaking the glass language.
- Add a **`cn()` helper** at `lib/cn.ts` (`clsx` + `tailwind-merge`). The repo has none
  today; variant-heavy primitives need it. Adds `clsx` + `tailwind-merge` deps.
- **Eliminate raw values** (audit hit-list):
  - `components/FlowGraphEditor.tsx` — `#fff` / `#cbd5e1` across 4 node renderers
    (lines ~85–86, 166–167, 353–354, 411–412) → token-driven (CSS vars).
  - Arbitrary box-shadows → `shadow-card`: `components/ui/Button.tsx:29`,
    `components/ui/SegmentedControl.tsx:32`.
  - Arbitrary `text-[Npx]` → the `hig-*` ramp: `EditDiffView.tsx`, `MermaidDiagram.tsx`,
    `BakeNav.tsx`, `EpicTaskCard.tsx`, `HelpPanel.tsx`, `AnalyzePanel.tsx`,
    `RunSheet.tsx` (≈9 occurrences).
  - `components/ui/SegmentedControl.tsx:30` `rounded-[7px]` → `rounded-md` / `rounded-sm`.
- **Documented exceptions** (allowed, namespaced — codified in the guide, allowlisted in
  the check script):
  - Sign-in aurora gradient stops (`#6f8cff`, `#b07cff`, `#4ad6ff`) and brand red
    `#ED3B3B` — intentional decorative/brand constants.
  - `app/api/jira/callback/route.ts` standalone OAuth popup HTML — convert its inline CSS
    to reference the token *values* via CSS vars so it conforms.
- Fixed layout dimensions (panel widths `w-[420px]`, min-heights `min-h-[320px]`, the
  `w-[3px]` accent edge, etc.) are **defensible layout values**, not design tokens, and
  are out of scope for token replacement (noted in the guide).

### Phase 2 — Shared primitives (`components/ui/`)

- **`Button`** — align primary to the sign-in CTA (`active:scale-[0.99]`, `shadow-card`,
  `ease-hig`). Add **`ButtonLink`** (or `asChild`) to replace the 4 duplicated
  "link-styled-as-button" strings in `StandaloneApp.tsx`, `drafts/DraftsView.tsx`,
  `drafts/DraftCard.tsx`, `drafts/DraftsDashboard.tsx`.
- **`Card` / `GlassCard`** — new primitive with a `tone` prop (`glass` | `solid` /
  `strong`) so each surface opts into the right legibility level.
- **`TextField` / `TextArea`** — align focus ring, border, radius, and **error state** to
  the sign-in field + danger-chip language.
- **`Alert` / `ErrorChip`** — shared primitive matching the sign-in error chip; replaces
  ad-hoc error alerts/banners in `StandaloneApp.tsx` (≈ lines 1108, 1219, 1284).
- **`SectionLabel`** — small component wrapping `.hig-section-label`.

### Phase 3 — Surface redesign (apply the language, calm surfaces)

Priority order:

1. **App shell / header** (`StandaloneApp.tsx`) — light-touch ambient treatment OK; route
   links through `ButtonLink`; type to ramp.
2. **Editor form** (`Editor.tsx`) — glass-strong card, upgraded inputs, section labels,
   consistent spacing rhythm, buttons via `Button`.
3. **Drafts** (`drafts/DraftsDashboard.tsx`, `DraftsView.tsx`, `DraftCard.tsx`) — already
   the "showcase surface"; mostly conformance + `ButtonLink`.
4. **Preview / Diagram / panels** (`Preview.tsx`, `DiagramView.tsx`, `FlowGraphEditor.tsx`,
   `AnalyzePanel.tsx`, sheets) — calm solid/strong surfaces; FlowGraphEditor hex removal.
5. **Epic-mode surfaces** (`components/epic/**`) — lighter-touch conformance to the type
   ramp + tokens.
6. **Empty / error / loading states** — natural home for light-touch aurora/glass.
7. **Embed variant** (`EmbedApp.tsx`) — inherits the language minus heavy shell chrome.

Light/dark must hold on every surface; reduced-motion already handled globally.

### Phase 4 — Style guide, enforcement, docs

- **`/styleguide` route** (`app/styleguide/page.tsx`) — renders colour swatches, the type
  ramp, the spacing scale, and every primitive (Button variants/sizes, fields incl.
  error, Card tones, Alert, SectionLabel) in light **and** dark via the existing
  `ThemeToggle`. The "design tooling" deliverable.
- **`docs/design-system.md`** — one section per pattern area (typography, colour tokens,
  spacing scale, form inputs, buttons, error states) with token reference tables +
  copy-paste className snippets; the **token naming conventions**; and the **Skill set /
  Getting started** section (tools: Tailwind v3 + token layer + `cn` + motion vocab;
  rules: no raw hex / no arbitrary values / semantic tokens / glass-tone guidance;
  step-by-step: add a token, build a conformant component, use `/styleguide`). Links to
  `/styleguide`.
- **Enforcement** — `scripts/check-tokens.mjs`: greps the codebase for raw hex and
  arbitrary colour/text `[...]` values, with an allowlist for documented exceptions.
  Wired as an npm script (e.g. `npm run check:tokens`). This keeps "no magic numbers"
  true going forward and directly satisfies the ticket's "scan the codebase to confirm
  absence."
- **README** — new "Design system" section after "Architecture at a glance" + an entry in
  the "Where things live" table, linking the guide and `/styleguide`.
- **`CHANGELOG.md`** (none exists → create) — entry documenting the design-token
  conventions introduced.

## Components / interfaces (new + changed)

| Unit | Location | Purpose |
| --- | --- | --- |
| `cn()` | `lib/cn.ts` | Merge conditional Tailwind classes |
| `.hig-glass` / `.hig-glass-strong` | `app/globals.css` | Named glass surface treatments |
| `ButtonLink` | `components/ui/Button.tsx` | Link rendered with button styling (kills 4 dupes) |
| `Card` / `GlassCard` | `components/ui/Card.tsx` | Surface primitive with `tone` prop |
| `Alert` / `ErrorChip` | `components/ui/Alert.tsx` | Shared error/alert presentation |
| `SectionLabel` | `components/ui/SectionLabel.tsx` | Eyebrow label primitive |
| Style guide page | `app/styleguide/page.tsx` | Living reference, light + dark |
| Token guide | `docs/design-system.md` | Pattern guide + getting-started |
| Token check | `scripts/check-tokens.mjs` | Enforcement: no raw hex / arbitrary values |

## Testing strategy

- **Enforcement script** `scripts/check-tokens.mjs` — fails on raw hex / arbitrary
  colour-text values outside the allowlist (the automated "scan").
- **Playwright** — smoke test that `/styleguide` renders; full existing e2e run to confirm
  no regressions. Pre-existing `finalize` / `export-metadata` e2e failures are
  known-failing (not introduced by this work) and tracked separately.
- **Manual** — side-by-side visual review of task creator vs sign-in in light + dark;
  confirm `/styleguide` renders all primitive states.
- **"Supported platforms"** scoped to: light/dark × standalone/embed variants, verified in
  Chromium.

## Out of scope

- New colours, spacing scale, or design *language* beyond what the sign-in page already
  establishes.
- Functional/behavioural changes to the task creator (this is a visual + tokenisation +
  documentation effort).
- Fixing the pre-existing `finalize` / `export-metadata` e2e failures.
- Fixed layout dimensions (panel widths, min-heights) — defensible, not tokens.

## Risks

- **Legibility regressions** from glass/translucency on dense panels — mitigated by
  `.hig-glass-strong` and reserving full glass/aurora for light-touch surfaces.
- **Scope creep across ~30 components** — mitigated by primitive-first sequencing: most
  surface changes become "swap to the primitive," not bespoke restyling.
- **Dark-mode breakage** — every change verified in both themes; `/styleguide` makes this
  fast to eyeball.
