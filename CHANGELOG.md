# Changelog

All notable changes to this project are documented here.

## [Unreleased]

### Added
- **Design system conventions (AI-51).** Formalised the HIG-based token system
  shared with the sign-in page: semantic colour/type/radius/shadow tokens
  (`tailwind.config.ts` + `app/globals.css`), shared `components/ui` primitives
  (`Button`/`ButtonLink`, `Card`, `Alert`, `SectionLabel`, `TextField`), named
  glass-surface classes (`hig-glass`, `hig-glass-strong`), a `cn()` class-merge
  helper, a living `/styleguide` reference, and the guide at `docs/design-system.md`.
- `npm run check:tokens` — fails the build on raw hex or arbitrary colour/type
  values outside the documented brand/decorative allowlist.
- Design polish foundation: accessible `accent-strong` (fill) / `accent-link`
  (text) / `danger-strong` tokens, `prominent` Button variant, `AmbientBackground`
  depth, `Skeleton` shimmer, shared `BrandMark`, and `celebrate`/`crossFade`
  motion. WCAG AA locked by a contrast regression test.
- Design polish applied across surfaces: ambient depth + shared BrandMark on app
  shells (home/embed), editor hero empty state, drafts hero + shimmer, glass-strong
  panels, prominent export/epic CTAs, success beat on export/finalize, single↔epic
  crossfade transition, and unified error text (Alert / danger-strong). Added a
  `hig-glass-edge` material for full-height edge panels.
- **Interaction primitives ("Interactive Atmosphere" foundation).** A reusable
  "alive layer" extracted from the sign-in page: `useSpotlight` (cursor-following
  accent glow) and `useMagneticHover` (≤6px CTA pull) hooks; `Typewriter`
  (rotating headline / clickable idea-prompts), `GhostDiagram` (self-drawing
  wireframe), and `SuccessFlourish` (one-shot success burst) components; an
  `AmbientBackground` `tone` prop (`idle`/`running`/`success`) for a reactive
  aurora; `readinessScore` (0–3 draft completeness); and `.icon-hover-rise` /
  `.icon-hover-nudge` glyph micro-animations. All reduced-motion safe with passive,
  rAF-throttled pointer handlers; demoed on `/styleguide` and documented in
  `docs/design-system.md`.
- **Alive layer applied across surfaces ("Interactive Atmosphere" phase 2).**
  Cursor-following spotlight glow (`useSpotlight` + `.spotlight`) on the editor
  form, draft cards, Preview's two working cards, JiraExport's panels, and the
  sign-in card; a ≤6px magnetic pull wired once inside `Button`/`ButtonLink` so
  every `prominent` CTA gets it for free; a reactive aurora driven from app state
  (`StandaloneApp` sets `running` during a finalize run and a brief `success`
  wash on a genuine finalize/export success — not on export cancel; `EmbedApp`
  does running/idle only); and an `.icon-hover-nudge` on the "Open in Jira" arrow.
- **Empty-state heroes ("Interactive Atmosphere" phase 3).** The blank-editor
  hero shows clickable rotating idea-prompts (`Typewriter`) that prefill the
  draft description; Preview's no-diagrams empty state shows a self-drawing
  `GhostDiagram`; and hovering a diagram-type segment in `DiagramView` floats a
  tiny per-type GhostDiagram-style sketch preview.
- **Functional delight ("Interactive Atmosphere" phase 4).** Draft cards reveal
  a fuller content peek on hover/focus (single → description excerpt; epic →
  task-count line); the editor footer shows a 3-segment `readinessScore` meter
  ("Ready to finalize" at 3/3) and a faint `↵ Finalize` shortcut chip; and a
  one-shot `SuccessFlourish` plays on JiraExport success and on the RunSheet
  finalized beat.

### Changed
- Task-creator surfaces (header, editor, drafts, diagram nodes, error states)
  brought into conformance with the design tokens; raw hex and magic `text-[Npx]`
  values removed.
