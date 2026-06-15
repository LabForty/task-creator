# Design System

The authoritative pattern guide for Task Creator's design system. It is based on
Apple's **Human Interface Guidelines (HIG)**: an SF type ramp, system-blue
accent, layered neutral surfaces, calm motion, and a strong light/dark contract.

This document is normative. If a value here disagrees with a component, the
component is wrong. Every token value below is taken directly from
`app/globals.css` and `tailwind.config.ts`.

---

## 1. Overview & principles

- **HIG-based.** Colours, type, radii, shadows, and motion follow iOS/macOS
  conventions. The look should read as "native Apple app on the web," not
  "generic Tailwind."
- **The sign-in page is the canonical exemplar.** `components/signin/SigninExperience.tsx`
  is the reference for how the language comes together — glass card, aurora
  background, HIG type ramp, accent CTA, calm motion. When in doubt about how
  something should feel, look there first.
- **Every value is a named token or utility.** No raw hex, no arbitrary colour
  or type values. You compose from semantic tokens (`bg-surface`, `text-ink`,
  `border-rule`) and the shared primitives in `components/ui`.
- **Designs must hold in BOTH light and dark mode.** Theme is class-based
  (`darkMode: "class"` in `tailwind.config.ts`; `<html class="dark">` toggled by
  `components/ThemeToggle.tsx`). The same utility (`bg-surface`) resolves to a
  different value per theme because it reads a CSS custom property. Never assume
  one mode — verify both on `/styleguide`.

---

## 2. Token naming conventions

Tokens are **semantic, not literal**. You write `text-danger`, never
`text-red-500`; `bg-surface-muted`, never `bg-gray-100`. The semantic name
survives a palette change; the literal one does not.

### Families and their state suffixes

| Family | Tokens | Purpose |
| --- | --- | --- |
| `accent` | `accent`, `accent-hover`, `accent-pressed`, `accent-tint` | System-blue primary action colour + interaction states + faint fill |
| `danger` | `danger`, `danger-tint` | Destructive / error |
| `warning` | `warning`, `warning-tint` | Caution |
| `success` | `success`, `success-tint` | Positive / confirmation |
| `surface` | `surface`, `surface-muted`, `surface-subtle`, `surface-inset` | Background hierarchy (card → page → recessed) |
| `ink` | `ink`, `ink-secondary`, `ink-tertiary`, `ink-quaternary` | Content/text hierarchy (primary → disabled) |
| `rule` | `rule`, `rule-strong` | Hairline borders and dividers |

The `-tint` suffix is a low-opacity wash of the same hue (fills, chips,
hover backgrounds). The `-hover`/`-pressed` suffixes are the accent's
interaction states.

### Where they live

1. **Values** are CSS custom properties in `app/globals.css`:
   - `:root { … }` holds the **light** values.
   - `html.dark { … }` holds the **dark** values.
2. **Mapping to Tailwind** happens in `tailwind.config.ts` under
   `theme.extend.colors`, e.g. `accent.DEFAULT: "var(--color-accent)"`. That is
   what turns `--color-accent` into the `bg-accent` / `text-accent` utilities.

### Adding a token

A token does not exist until it is defined in **both** themes **and** mapped.
Skipping either step gives you a token that breaks one theme or isn't a utility.

1. Add the variable to `:root` in `app/globals.css` (light value).
2. Add the same variable to `html.dark` in `app/globals.css` (dark value).
3. Map it under `theme.extend.colors` in `tailwind.config.ts`.

---

## 3. Typography

The HIG type ramp lives in `tailwind.config.ts` (`theme.extend.fontSize`) as
`hig-*` tokens. Use them via `text-hig-*`. The body default is `text-hig-body`
(set on `<body>` in `app/globals.css`).

| Token | Size | Line height | Letter spacing | Weight | Typical use |
| --- | --- | --- | --- | --- | --- |
| `text-hig-caption` | 12px | 16px | 0px | (inherit) | Captions, eyebrows, fine print |
| `text-hig-footnote` | 13px | 18px | -0.08px | (inherit) | Footnotes, helper/error text, small buttons |
| `text-hig-subhead` | 15px | 20px | -0.24px | (inherit) | Subheads, labels, medium buttons |
| `text-hig-body` | 17px | 22px | -0.41px | (inherit) | Body copy (page default) |
| `text-hig-headline` | 17px | 22px | -0.41px | 600 | Emphasised body / large-button label |
| `text-hig-title3` | 20px | 24px | 0.38px | 600 | Section titles |
| `text-hig-title2` | 22px | 28px | 0.35px | 600 | Card / panel titles |
| `text-hig-title1` | 28px | 34px | 0.36px | 600 | Page titles |
| `text-hig-large` | 34px | 41px | 0.37px | 700 | Hero / display |

The font stack is set in `tailwind.config.ts` (`fontFamily.sans` → SF Pro Text /
Display with `-apple-system` and `Segoe UI` fallbacks; `fontFamily.mono` → SF
Mono / Menlo / Consolas).

**Rule:** never use `text-[Npx]`. Map to the nearest ramp token. Arbitrary font
sizes (`text-[12px]`, `text-[1.1rem]`) are flagged by `npm run check:tokens`.

---

## 4. Colour tokens

Values are CSS custom properties in `app/globals.css` (light in `:root`, dark in
`html.dark`) and surface as `bg-*` / `text-*` / `border-*` utilities via
`tailwind.config.ts`.

| Token (utility stem) | Light | Dark |
| --- | --- | --- |
| `accent` | `#007aff` | `#0a84ff` |
| `accent-hover` | `#0064d6` | `#409cff` |
| `accent-pressed` | `#0050a8` | `#1f6feb` |
| `accent-tint` | `#e9f1ff` | `rgba(10,132,255,0.18)` |
| `danger` | `#ff3b30` | `#ff453a` |
| `danger-tint` | `#ffe7e6` | `rgba(255,69,58,0.18)` |
| `warning` | `#ff9500` | `#ff9f0a` |
| `warning-tint` | `#fff3df` | `rgba(255,159,10,0.18)` |
| `success` | `#34c759` | `#30d158` |
| `success-tint` | `#e2f7e8` | `rgba(48,209,88,0.18)` |
| `surface` | `#ffffff` | `#1c1c1e` |
| `surface-muted` | `#f5f5f7` | `#2c2c2e` |
| `surface-subtle` | `#fafafc` | `#0a0a0c` |
| `surface-inset` | `#eeeef1` | `#3a3a3c` |
| `ink` | `#1d1d1f` | `#f5f5f7` |
| `ink-secondary` | `#6e6e73` | `#aeaeb2` |
| `ink-tertiary` | `#86868b` | `#8e8e93` |
| `ink-quaternary` | `#c7c7cc` | `#545458` |
| `rule` | `rgba(0,0,0,0.10)` | `rgba(255,255,255,0.12)` |
| `rule-strong` | `rgba(0,0,0,0.18)` | `rgba(255,255,255,0.22)` |

### Shadows (also tokenised)

| Token (utility) | Light | Dark |
| --- | --- | --- |
| `shadow-card` | `0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06)` | `0 1px 2px rgba(0,0,0,0.30), 0 4px 12px rgba(0,0,0,0.45)` |
| `shadow-elevated` | `0 2px 4px rgba(0,0,0,0.04), 0 12px 28px rgba(0,0,0,0.10)` | `0 2px 4px rgba(0,0,0,0.35), 0 12px 28px rgba(0,0,0,0.55)` |
| `shadow-focus` | `0 0 0 3px rgba(0,122,255,0.30)` | `0 0 0 3px rgba(10,132,255,0.40)` |

### The "no raw hex" rule

Raw hex literals and arbitrary colour utilities (`bg-[#fff]`, `text-[#abc]`,
`border-[rgba(...)]`, `fill-[…]`, `stroke-[…]`, etc.) are forbidden and flagged
by `npm run check:tokens`. Use a semantic token.

### Documented exceptions

These are real, intentional, brand/decorative values. Each is marked in code
with a trailing `// design-tokens-allow: <reason>` comment, which the scanner
honours:

- **LabForty brand red** — `#ED3B3B`, the diamond in the wordmark. It is a fixed
  brand colour that must not shift with the theme
  (`components/signin/SigninExperience.tsx`).
- **Sign-in aurora gradient stops** — the decorative blob hues
  (`#6f8cff`, `#b07cff`, `#4ad6ff`) in the `.signin-blob--*` rules in
  `app/globals.css`. These are atmosphere, not semantic surfaces.
- **Standalone Jira OAuth callback page** — a minimal, themeless interstitial
  rendered outside the app shell.
- **Epic-graph Mermaid `classDef` palette** — the node fills/strokes Mermaid
  needs as literal hex in its diagram definitions.

If you genuinely need a one-off colour, ask whether it should be a token first.
Only reach for the allow-marker for brand or decorative values that legitimately
cannot be a theme token.

---

## 5. Spacing scale

Use Tailwind's **default spacing scale** for all padding, margin, gap, and
stack spacing: `p-*`, `px-*`, `py-*`, `m-*`, `gap-*`, `space-x-*`, `space-y-*`
(e.g. `p-6`, `gap-4`, `space-y-3`). Do not invent arbitrary spacing where a
scale step works.

**Fixed layout DIMENSIONS via arbitrary values are acceptable** — widths,
heights, positions, insets, and line-heights such as `w-[420px]`,
`max-w-md`, `min-h-[320px]`, `top-[3.7rem]`, `inset-x-8`. The token scanner
explicitly allows the `w/h/min-*/max-*/size/top/bottom/left/right/inset/gap/translate-*/leading/basis-[…]`
prefixes because these are defensible layout decisions, not theme values.

**Arbitrary COLOUR and TYPE values are not acceptable.** `bg-[#…]`,
`text-[14px]`, and `rounded-[7px]` are violations. Colour → semantic token;
type → `hig-*` ramp; radius → the `rounded-{sm,md,lg,xl}` scale
(`6px / 10px / 14px / 22px`, defined in `tailwind.config.ts`).

---

## 6. Form inputs

Use `TextField` and `TextArea` from `components/ui/TextField.tsx`. Both take
`label` (required), `description` (optional helper), and `error` (optional
message) props, plus any native input/textarea attributes. They render an
accessible label/description/error structure for you — do not hand-roll labels
or input className strings.

- Focus ring is `focus:shadow-focus` (the tokenised accent glow), paired with
  `focus:border-accent`.
- The **error** state shows a danger border (`border-danger focus:border-danger`),
  sets `aria-invalid="true"`, wires `aria-describedby` to the message, and
  renders the message in `text-danger` at `text-hig-footnote`.

```tsx
import { TextField, TextArea } from "@/components/ui/TextField";

<TextField
  label="Summary"
  description="A short, action-oriented title."
  placeholder="Add dark-mode toggle to settings"
  value={summary}
  onChange={(e) => setSummary(e.target.value)}
/>

<TextField
  label="Story points"
  error="Must be a positive number"
  value={points}
  onChange={(e) => setPoints(e.target.value)}
/>

<TextArea
  label="Description"
  description="Markdown supported."
  rows={6}
  value={description}
  onChange={(e) => setDescription(e.target.value)}
/>
```

---

## 7. Buttons

Use `Button` (and `ButtonLink` for navigations) from `components/ui/Button.tsx`.

- **Variants:** `primary` (default), `secondary`, `ghost`, `danger`, `success`,
  `warning`.
- **Sizes:** `sm` (h-7), `md` (default, h-9), `lg` (h-11).
- `ButtonLink` renders a Next.js `<Link>` that looks like a button (defaults to
  `secondary`); use it for links that should read as buttons (header nav, drafts
  surfaces) instead of duplicating button className strings.

All variants ship the shared base: rounded-md, HIG ease micro-transition,
`focus-visible:shadow-focus`, `active:scale-[0.985]`, and disabled handling.

**Rule:** never hand-roll a button className string — use the primitive. (If you
need the class string outside a `<button>`, the `buttonClasses(variant, size)`
helper is exported for that one case.)

```tsx
import { Button, ButtonLink } from "@/components/ui/Button";

<Button onClick={save}>Save draft</Button>            {/* primary md */}
<Button variant="secondary" onClick={cancel}>Cancel</Button>
<Button variant="ghost" size="sm">Details</Button>
<Button variant="danger" onClick={remove}>Delete</Button>
<Button variant="success">Export to Jira</Button>
<Button variant="warning">Discard changes</Button>
<Button disabled>Saving…</Button>

<ButtonLink href="/drafts">Back to drafts</ButtonLink>
<ButtonLink href="/new" variant="primary" size="lg">New task</ButtonLink>
```

---

## 8. Surfaces

Use `Card` from `components/ui/Card.tsx`. The `tone` prop picks the surface
treatment:

| `tone` | Backing class | When to use |
| --- | --- | --- |
| `solid` (default) | `.hig-card` (`bg-surface rounded-lg shadow-card`) | Opaque card for dense data — lists, tables, working panels |
| `glass` | `.hig-glass` (`rounded-xl border border-rule shadow-elevated backdrop-blur-xl` + a ~70%-opaque surface background) | The sign-in card treatment — spacious / light-touch moments (headers, empty states, dialogs) |
| `glass-strong` | `.hig-glass-strong` (~85%-opaque surface, otherwise as `glass`) | Higher opacity for dense working surfaces that still want the glass language (editor, panels) |

> The translucent background is set with `background-color: color-mix(in srgb, var(--color-surface) 70%, transparent)` (85% for `-strong`), not `@apply bg-surface/70`. Tailwind's opacity modifier works as an inline utility but not inside `@apply` for a CSS-variable colour; `color-mix` re-evaluates `--color-surface` per light/dark theme.

**Calm-surfaces guidance.** Reserve full glass + aurora for spacious moments
where there is room to breathe. Keep dense panels legible: use `solid` or
`glass-strong` rather than translucent `glass` behind a lot of text or controls.
The glass language should feel calm, not busy.

```tsx
import { Card } from "@/components/ui/Card";

<Card>…dense list…</Card>                       {/* solid */}
<Card tone="glass" className="p-8">…hero…</Card>
<Card tone="glass-strong" className="p-6">…editor panel…</Card>
```

**Forms / non-`<div>` roots.** `Card` renders a `<div>`. When the surface needs
to be a different element (e.g. a `<form>` root), apply the class directly
instead of wrapping:

```tsx
<form className="hig-glass-strong p-6">…</form>
```

The class names (`.hig-card`, `.hig-glass`, `.hig-glass-strong`) are defined in
the `@layer components` block of `app/globals.css`.

---

## 9. Error states

Use `Alert` from `components/ui/Alert.tsx` for inline status messages. The
`tone` prop selects the language; it mirrors the sign-in error chip
(`border-danger/30 bg-danger/5 …`). It renders `role="alert"`, a rounded border,
`px-4 py-2.5`, and `text-hig-footnote`.

| `tone` | Use |
| --- | --- |
| `danger` (default) | Errors, failures |
| `warning` | Caution, recoverable issues |
| `success` | Confirmations |
| `accent` | Neutral / informational |

```tsx
import { Alert } from "@/components/ui/Alert";

<Alert>Couldn’t reach Jira. Check your connection and try again.</Alert>
<Alert tone="warning">This draft hasn’t been saved in a while.</Alert>
<Alert tone="success">Exported to Jira as PROJ-128.</Alert>
<Alert tone="accent">Drafts auto-save after 60 seconds of inactivity.</Alert>
```

---

## 10. Motion

Motion vocabulary lives in `lib/motion.ts`. Everything animated imports from
there — nobody hand-rolls durations or easings. Division of labour: Framer
(`motion/react`) handles entrances, exits, and layout reflow; CSS handles
hover/press micro-states.

| Export | Value | Use |
| --- | --- | --- |
| `SPRING` | `{ type: "spring", stiffness: 500, damping: 30, mass: 0.9 }` | Lively-but-professional entrance spring (~300ms settle, one subtle overshoot) |
| `EASE_HIG` | `[0.25, 0.1, 0.25, 1]` | Cubic-bezier for fast non-spring moments (exits, menus); matches the CSS `ease-hig` curve |
| `DUR_FAST` | `0.15` (seconds) | Fast exits/transitions |
| `fadeUp` | Variants: fade + rise (`y: 14`) in with `SPRING`; fade + shrink out fast | List/card entrances; stagger with `custom={index}` |
| `scaleIn` | Variants: scale-in from 95%, faster scale-out | Menus and popovers |
| `staggerDelay(index)` | `min(index, 8) * 0.04` s | Per-item entrance delay; caps at the 8th item so long lists don't crawl in |

```tsx
import { motion } from "motion/react";
import { fadeUp } from "@/lib/motion";

<motion.div variants={fadeUp} initial="hidden" animate="visible" exit="exit" custom={i}>
  …card…
</motion.div>
```

**CSS micro-state idiom** for hover/press (the primitives use this):

```
transition-all duration-150 ease-hig
```

`ease-hig` is registered in `tailwind.config.ts`
(`transitionTimingFunction.hig = cubic-bezier(0.25, 0.1, 0.25, 1)`), matching
`EASE_HIG`.

**Reduced motion.** `components/MotionRoot.tsx` sets `reducedMotion="user"`
globally on `MotionConfig`, so Framer disables transform/layout animation for
users who prefer reduced motion (opacity still fades). Additionally, a global
`@media (prefers-reduced-motion: reduce)` rule in `app/globals.css` zeroes all
animation/transition durations. Decorative CSS animations (sign-in aurora,
caret, sheen) defer to that rule automatically.

---

## 11. Skill set / Getting started

### Tools

- **Tailwind CSS v3.4** (`tailwindcss ^3.4.15`), configured in
  `tailwind.config.ts` with `darkMode: "class"`.
- **The CSS-variable token layer** in `app/globals.css` (`:root` + `html.dark`).
- **The `cn()` helper** at `lib/cn.ts` — `clsx` + `tailwind-merge` (last
  conflicting utility wins). Prefer it over hand-built template strings in
  variant-heavy components.
- **The motion vocabulary** at `lib/motion.ts`.
- **The live `/styleguide` route** — all swatches and primitives in both themes.

### Conventions / rules

- No raw hex; no arbitrary colour or type values — enforced by
  `npm run check:tokens`.
- Use semantic tokens (`bg-surface`, `text-ink`, `border-rule`), never literal
  palette names.
- Type comes from the `hig-*` ramp; radius from `rounded-{sm,md,lg,xl}`.
- Pick the right `Card` tone (Section 8): `solid`/`glass-strong` for dense,
  `glass` for spacious.
- Layout dimensions via arbitrary values are fine; colour/type are not.

### Step-by-step onboarding

1. **Add a token (if needed).** Edit `:root` (light) **and** `html.dark` (dark)
   in `app/globals.css`, then map it under `theme.extend.colors` in
   `tailwind.config.ts`. (See Section 2.)
2. **Build a conformant component.** Compose the `components/ui` primitives
   (`Button`, `Card`, `Alert`, `TextField`/`TextArea`, `SectionLabel`) and use
   `cn()` for conditional classes. Reach for semantic tokens and the `hig-*`
   ramp; pull motion from `lib/motion.ts`. The sign-in page is your exemplar.
3. **Preview it on `/styleguide`.** Run `npm run dev` and open
   `http://localhost:3000/styleguide`. Toggle the theme and confirm it holds in
   both light and dark.
4. **Run the scanner before opening a PR:** `npm run check:tokens`. Fix any
   violations (or, for genuine brand/decorative values, mark the line with
   `// design-tokens-allow: <reason>`).

---

## 12. Living reference

The `/styleguide` route renders every token swatch and primitive (buttons,
cards, alerts, fields, type ramp) in both light and dark mode. It is the living,
runnable companion to this document — when this guide and the styleguide drift,
update both.

```bash
npm run dev
# then open http://localhost:3000/styleguide and toggle the theme
```

The page source is `app/styleguide/page.tsx`.
