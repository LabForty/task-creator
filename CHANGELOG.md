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

### Changed
- Task-creator surfaces (header, editor, drafts, diagram nodes, error states)
  brought into conformance with the design tokens; raw hex and magic `text-[Npx]`
  values removed.
