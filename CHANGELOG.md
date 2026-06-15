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

### Changed
- Task-creator surfaces (header, editor, drafts, diagram nodes, error states)
  brought into conformance with the design tokens; raw hex and magic `text-[Npx]`
  values removed.
