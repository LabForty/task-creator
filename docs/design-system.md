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

### Accessible colour tokens (`*-strong` / `accent-link`)

The vivid `accent`/`danger` values above are tuned for *fills* — they read
beautifully as backgrounds, tints, and icons, but as **text** or as a **button
fill under a white label** they fall short of WCAG AA (4.5:1 for normal text).
A small set of darker/adjusted siblings carry those jobs:

| Token (utility stem) | Light | Dark | Used for |
| --- | --- | --- | --- |
| `accent-strong` | `#0064d6` (white-on-fill 5.54) | `#0a72ec` (white-on-fill 4.53) | Button FILL with a white label — `bg-accent-strong` (`Button` `primary`/`prominent`) |
| `accent-link` | `#0064d6` (text-on-surface 5.54) | `#0a84ff` (text-on-surface 4.66) | Accent-as-TEXT — `text-accent-link` (`Button` `ghost`, links) |
| `danger-strong` | `#d70015` (text-on-surface 5.38) | `#ff453a` (text-on-surface 4.99) | Error TEXT — `Alert` danger tone + `TextField` error message |

`ink-tertiary` was also darkened in **light** mode (`#86868b` → `#76767b`,
4.52:1) so eyebrow/caption labels clear AA; the dark value (`#8e8e93`) was
already fine.

**The rule.** Use vivid `accent`/`danger` for **fills, tints, borders, icons,
focus rings, and the aurora**. Use `*-strong` / `accent-link` for **colour-as-
text and white-on-fill buttons**. You almost never reach for these directly —
the primitives (`Button`, `Alert`, `TextField`) already do.

**Why two accent tokens?** A single accent value can't satisfy both jobs in dark
mode: a white label on the fill needs a *darker* blue to hit AA (`#0a72ec`),
while accent text on a dark surface needs a *lighter* blue (`#0a84ff`). So the
foundation splits them — `accent-strong` for fills, `accent-link` for text.
(In light mode both happen to be `#0064d6`, but they stay separate tokens so the
dark split is expressible.)

### Shadows (also tokenised)

| Token (utility) | Light | Dark |
| --- | --- | --- |
| `shadow-card` | `0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06)` | `0 1px 2px rgba(0,0,0,0.30), 0 4px 12px rgba(0,0,0,0.45)` |
| `shadow-elevated` | `0 2px 4px rgba(0,0,0,0.04), 0 12px 28px rgba(0,0,0,0.10)` | `0 2px 4px rgba(0,0,0,0.35), 0 12px 28px rgba(0,0,0,0.55)` |
| `shadow-focus` | `0 0 0 3px rgba(0,122,255,0.30)` | `0 0 0 3px rgba(10,132,255,0.40)` |

### The "no raw hex" rule

Raw hex literals and arbitrary colour utilities (`bg-[#fff]`, `text-[#abc]`,
`border-[rgba(...)]`, `fill-[…]`, `stroke-[…]`, etc.) are forbidden in component
code and flagged by `npm run check:tokens`. Use a semantic token.

**Scanner scope.** `check:tokens` scans **`.ts`/`.tsx` files** under `app/`,
`components/`, and `lib/` — i.e. component code, where every value must be a
token. It deliberately does **not** scan `.css`. `app/globals.css` is the *token
layer itself*: the `:root` and `html.dark` blocks define every `--color-*` value
as raw hex/rgba (that is their source of truth), and the decorative CSS (the
sign-in aurora blob hues `#6f8cff`/`#b07cff`/`#4ad6ff`, vignette, sheen) lives
there too. Raw colour values are expected and correct in `globals.css`; they are
out of the scanner's scope by design, not via an allow-marker.

### Documented exceptions (in component code)

A few intentional raw values remain in `.ts`/`.tsx` and are each marked in code
with a trailing `// design-tokens-allow: <reason>` comment, which the scanner
honours:

- **LabForty brand red** — `#ED3B3B`, the diamond in the wordmark. A fixed brand
  colour that must not shift with the theme. Hoisted to a marked `BRAND_RED`
  const in `components/signin/SigninExperience.tsx`.
- **Standalone Jira OAuth callback page** — `app/api/jira/callback/route.ts`
  renders a self-contained HTML string outside the app shell (no Tailwind). It
  mirrors the token values via a marked `:root{…}` CSS block.
- **Epic-graph Mermaid `classDef` palette** — `lib/epic/taskGraph.ts`; the node
  fills/strokes Mermaid needs as literal hex in its diagram definitions (Mermaid
  cannot resolve CSS `var()`).

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
  renders the message in `text-danger-strong` at `text-hig-footnote` (the AA-safe
  error-text token — see the error-text rule in Section 9; the vivid `danger`
  here is the *border*, a fill/affordance).

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
  `warning`, `prominent`.
- **`prominent`** is the **marquee CTA** treatment — the sign-in CTA language:
  `accent-strong` fill, white label, `shadow-card`, and a sheen that drifts
  across on hover (`.cta-prominent`/`.cta-sheen` in `globals.css`). Reserve it
  for the single most important action on a surface (Finalize, Export to Jira,
  the empty-state CTA); do not pepper a screen with it.
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
<Button variant="prominent">Export to Jira</Button>  {/* marquee CTA only */}
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

### `hig-glass-edge` — full-height EDGE panels

`hig-glass-edge` is the glass **material** for full-height **edge** panels — the
docked side asides (run sheet, help panel, kneading/bake/upload sheets) and the
app **header**. It is `backdrop-blur-xl` over the same ~85%-opaque `color-mix`
surface as `hig-glass-strong`, but **without the card chrome**: no radius, no
border, no shadow. Edge panels are flush against a screen edge and supply their
own **single edge border** (`border-l`/`border-r`/`border-b border-rule`), so
baking a full rounded/bordered/shadowed card frame into the material would be
wrong. It is a utility class only (not a `Card` tone) — apply it directly on the
`<header>`/`<aside>`.

| Material | Chrome | Use |
| --- | --- | --- |
| `hig-glass-strong` | rounded-xl + border + shadow-elevated (full card frame) | **CARDS** — dense working panels that want the glass language |
| `hig-glass-edge` | none (panel supplies its own single edge border) | **Docked full-height / edge panels** — side asides, app header |

Both sit at **85% surface** (via `color-mix`), so dense content stays legible
over the ambient background — they share the `glass-strong` legibility budget,
just with different framing.

```tsx
{/* docked side aside — supplies its own left edge border */}
<aside className="border-l border-rule hig-glass-edge h-screen …">…</aside>

{/* app header — supplies its own bottom edge border */}
<header className="border-b border-rule hig-glass-edge sticky top-0 …">…</header>
```

### Gotcha — the `/NN` opacity modifier is silently dropped on token colours

Tailwind's `/NN` opacity modifier (e.g. `bg-surface/70`, `bg-surface-muted/30`)
produces **no CSS** for this project's `var()`-based colour tokens — it is
silently dropped, so you get a fully **opaque** (or, for `@apply`, **absent**)
fill rather than the translucency you asked for. This bites both inline and
inside `@apply`.

What to use instead:

- **Translucent token surface** → use `color-mix` (as the `.hig-glass*` classes
  do) or the `.hig-glass-edge` utility. Don't reach for `bg-surface/NN`.
- **Flat tint** (no translucency needed) → use a solid token: `bg-surface-muted`
  or `bg-surface-inset`.

Two **pre-existing** instances still use the broken pattern and are a known
follow-up (not regressions): the `signin` card
(`components/signin/SigninExperience.tsx` — `bg-surface/70`) and `EditDiffView`
(`components/EditDiffView.tsx` — `bg-surface-muted/30`). They render opaque
rather than translucent; harmless today, but should migrate to `color-mix` / a
solid token.

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

### Depth — `AmbientBackground`

`AmbientBackground` (`components/AmbientBackground.tsx`) is a static, dim,
token-tinted aurora layer that gives an app shell atmospheric depth without
stealing attention. It is the calm sibling of the sign-in aurora: derived from
the same `.ambient-*` vocabulary in `globals.css`, but **dimmer and not
animated**, so panels stay legible.

- **One per app shell.** Render it once, as the first child of a `relative`
  shell root. It positions itself `absolute inset-0 -z-10`, is `aria-hidden`,
  and is `pointer-events-none`, so it sits behind content and never intercepts
  clicks.
- **Calm/static by design.** Reserve motion and brightness for the sign-in page;
  the app shell wants depth, not spectacle. Keep working panels on `glass-strong`
  (or `solid`) over the ambient layer so dense content stays readable — this is
  the "calm surfaces" principle (Section 8) applied to depth.

```tsx
import { AmbientBackground } from "@/components/AmbientBackground";

<div className="relative min-h-screen">
  <AmbientBackground />
  <Card tone="glass-strong" className="relative p-6">…panel…</Card>
</div>
```

### Loading — `Skeleton` (shimmer)

`Skeleton` (`components/ui/Skeleton.tsx`) is the shimmer loading placeholder. It
**replaces static `animate-pulse`** blocks. Pass sizing/shape via `className`
(e.g. `h-4 w-44`); the sweep is the `.hig-shimmer` CSS animation in
`globals.css`, which reduced-motion neutralises to a flat tint.

```tsx
import { Skeleton } from "@/components/ui/Skeleton";

<Card className="flex flex-col gap-2.5 p-6">
  <Skeleton className="h-4 w-44" />
  <Skeleton className="h-3 w-3/4" />
</Card>
```

### Brand — `BrandMark`

`BrandMark` (`components/BrandMark.tsx`) is the shared LabForty wordmark glyph,
extracted so the sign-in page and the app header render the same mark. Strokes
use `currentColor` (adapts to the theme); the diamond keeps the fixed brand red
(`BRAND_RED` = `#ED3B3B`, carrying its `design-tokens-allow` marker). Takes an
optional `size` prop (default `36`).

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

**The error-text rule.** Error **message text** uses `<Alert>` (preferred) or,
where an inline `<Alert>` doesn't fit, `text-danger-strong` — **never raw
`text-danger`**. The vivid `danger` token is tuned for *fills* and fails WCAG AA
as text on a surface; `danger-strong` is the AA-safe sibling (Section 4). Reserve
vivid `danger` for **fills, badges, borders, icons, and affordances** (e.g. a
destructive `Button variant="danger"`, a `danger-tint` chip, the `TextField`
error border) — not for the words of the message. The primitives already encode
this: `Alert` danger tone and `TextField`'s error message both render in
`danger-strong`.

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
| `celebrate` | Variants: a quick scale pop (`0.9 → 1.04 → 1`) that settles | Success beats — export/finalize confirmation |
| `crossFade` | Variants: gentle fade+rise in, fade+rise out the opposite way | View transitions (single↔epic); pair with `AnimatePresence mode="wait"` |
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

## 11. Interaction primitives

The "alive layer" — a small set of reusable interaction hooks and decorative
components that give surfaces atmosphere (cursor-following glow, magnetic CTAs,
rotating headlines, self-drawing wireframes, a success burst, a reactive
aurora). They were **extracted from the sign-in page**, the canonical exemplar:
the spotlight and typewriter began as bespoke sign-in code and were generalised
so the rest of the app reuses the exact same behaviour rather than re-rolling it.

Three rules govern every primitive here:

- **Reuse-first.** These are the shared vocabulary for interaction — compose
  them; do not hand-roll glows, magnetic pulls, or typewriter state machines at a
  call site. Sign-in now consumes `useSpotlight` + `Typewriter` itself, proving
  the extraction.
- **Reduced-motion safe.** Every one degrades gracefully under
  `prefers-reduced-motion: reduce` — the hooks become no-ops (glow stays centered,
  no magnetic pull), and the decorative components render their static end-state
  (first phrase, completed wireframe, neutralised flourish). This is checked at
  the source so call sites get it for free.
- **Pointer handlers are passive + rAF-throttled.** The pointer hooks attach
  `pointermove` with `{ passive: true }` and coalesce work into a single
  `requestAnimationFrame`, so cursor tracking never blocks scrolling or thrashes
  layout.

All of these are demoed live on `/styleguide` ("Interaction primitives").

### Hooks — `lib/interaction`

| Hook | Returns | Behaviour | Reduced-motion |
| --- | --- | --- | --- |
| `useSpotlight<T>()` | a `ref` for the element | On pointer move sets `--spot-x`/`--spot-y` (percent) on the element; pair with the `.spotlight` class (`globals.css`), whose `::before` draws a cursor-following accent glow. | No tracking — glow stays centered |
| `useMagneticHover<T>()` | a `ref` for the element | While hovered, translates the element toward the cursor by a damped amount capped at **6px**; eases back to `0` on leave. For prominent CTAs only — barely-there pull. | No-op (no transform) |

Both are client hooks, both attach a passive + rAF-throttled `pointermove`
listener, and both clean up on unmount. Attach the returned `ref` to the target
element — do **not** read `ref.current` during render (the
`react-hooks/refs` lint rule forbids it).

```tsx
import { useSpotlight } from "@/lib/interaction/useSpotlight";

const cardRef = useSpotlight<HTMLDivElement>();
<Card ref={cardRef} className="spotlight p-6">…</Card>
```

```tsx
import { useMagneticHover } from "@/lib/interaction/useMagneticHover";

const ctaRef = useMagneticHover<HTMLButtonElement>();
<button ref={ctaRef} className="… transition-transform">Export to Jira</button>
```

### Components — `components/ui`

- **`Typewriter`** (`components/ui/Typewriter.tsx`) — a rotating type → hold →
  delete → next headline, extracted from sign-in. Props
  `{ phrases: string[]; onPick?: (phrase) => void; className? }`. The live region
  is `role="status"`. With `onPick` it renders the phrase as a clickable
  `<button>` (used for the editor's clickable idea-prompts). Reduced-motion:
  renders the first phrase statically (no typing).

  ```tsx
  import { Typewriter } from "@/components/ui/Typewriter";

  <Typewriter phrases={["Export users as CSV", "Add a payments dashboard"]} />
  <Typewriter phrases={IDEA_PROMPTS} onPick={(p) => applyIdea(p)} className="text-accent-link" />
  ```

- **`GhostDiagram`** (`components/ui/GhostDiagram.tsx`) — a decorative,
  `aria-hidden` wireframe that self-draws on a loop (`.ghost-diagram` in
  `globals.css`), hinting at the diagrams "Create diagrams" will produce. Takes
  `HTMLAttributes<HTMLDivElement>`; size it via `className`. Reduced-motion:
  renders the completed static wireframe.

  ```tsx
  import { GhostDiagram } from "@/components/ui/GhostDiagram";

  <GhostDiagram className="mx-auto h-28 w-48" />
  ```

- **`SuccessFlourish`** (`components/ui/SuccessFlourish.tsx`) — a one-shot
  (~600ms) expanding accent ring + a few sparks, for success beats. Decorative,
  `aria-hidden`, `pointer-events-none`, and absolutely positioned (`absolute
  inset-0`) — drop it inside a `relative` success surface. It replays by being
  re-mounted, so key it on the success event (or a counter). Reduced-motion: the
  global rule neutralises the burst; pair with the `celebrate` motion beat
  (Section 10) on the content.

  ```tsx
  import { SuccessFlourish } from "@/components/ui/SuccessFlourish";

  <div className="relative …">
    {success && <SuccessFlourish key={successId} />}
  </div>
  ```

### `AmbientBackground` `tone` prop

`AmbientBackground` (Section 8) now takes `tone?: "idle" | "running" | "success"`
(default `"idle"`), reflected as a `data-tone` attribute. The CSS transitions the
aurora tint between states (`globals.css`): `running` warms/brightens the layer
slightly, `success` adds a brief one-shot wash. Wire it from app state — e.g.
`"running"` while a task runs, a transient `"success"` after a finalize/export.
Reduced-motion: the transition/burst are neutralised.

```tsx
<AmbientBackground tone={auroraTone} />   // "idle" | "running" | "success"
```

### `readinessScore` — `lib/draft/readiness.ts`

`readinessScore(draft): number` returns a client-side completeness score from `0`
to `READINESS_MAX` (`3`): +1 for a title, +1 for a description of at least 40
visible characters, +1 for at least one non-empty acceptance criterion. No AI, no
network — a cheap signal for an editor readiness hint.

```tsx
import { readinessScore, READINESS_MAX } from "@/lib/draft/readiness";

const score = readinessScore(draft); // 0..READINESS_MAX
```

### Icon-hover micro-animations

Two opt-in CSS classes in `app/globals.css` add a tiny transform to inline SVG
glyphs on hover. They respond to hover on the element itself **or** on an
ancestor `.group` (Tailwind's `group` pattern), so a glyph can lift/nudge when
its button is hovered:

| Class | Effect |
| --- | --- |
| `.icon-hover-rise` | lifts the glyph `1px` (`translateY(-1px)`) |
| `.icon-hover-nudge` | nudges the glyph `2px` right (`translateX(2px)`) — e.g. an export arrow |

Both use the HIG ease and are zeroed under reduced motion.

### Per-surface application

Where the primitives above are actually wired. This is the "where it's used"
companion to the API docs above — it does not re-document the primitives, only
the surfaces that consume them. The three cross-cutting guarantees still hold
everywhere they appear: **reduced-motion safe**, **passive + rAF-throttled**
pointer handlers, and **reuse-first** (compose the primitive, never re-roll it
at the call site).

| Surface | Primitive(s) | Behaviour at that surface |
| --- | --- | --- |
| Editor form, draft cards, Preview's two working cards, JiraExport's panels, sign-in card | `useSpotlight` + `.spotlight` | Cursor-following accent glow on the working surfaces |
| All `prominent` CTAs (via `Button` / `ButtonLink`) | `useMagneticHover` | ≤6px magnetic pull, wired once inside the primitive — every `variant="prominent"` gets it for free |
| `StandaloneApp` shell | `AmbientBackground` `tone` | `running` while a finalize run is in flight; a brief `success` wash on a genuine finalize/export success (not on export cancel); `idle` otherwise |
| `EmbedApp` shell | `AmbientBackground` `tone` | `running`/`idle` only |
| "Open in Jira" arrow | `.icon-hover-nudge` | Arrow nudges right on hover |
| Blank-editor hero | `Typewriter` (with `onPick`) | Clickable rotating idea-prompts that prefill the draft description |
| Preview no-diagrams empty state | `GhostDiagram` | Self-drawing wireframe hinting at the diagrams to come |
| `DiagramView` diagram-type segments | GhostDiagram-style sketch | Hovering a type segment floats a tiny per-type sketch preview |
| Draft cards (single / epic) | Hover-peek | On hover/focus reveals a fuller content peek — single → description excerpt; epic → task-count line |
| Editor footer | `readinessScore` | 3-segment readiness meter; "Ready to finalize" at 3/3 |
| Editor footer | Shortcut hint | A faint `↵ Finalize` chip — the only wired shortcut |
| JiraExport success, RunSheet finalized beat | `SuccessFlourish` | Plays once on the success beat |

---

## 12. Skill set / Getting started

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

## 13. Living reference

The `/styleguide` route renders every token swatch and primitive (buttons,
cards, alerts, fields, type ramp) in both light and dark mode. It is the living,
runnable companion to this document — when this guide and the styleguide drift,
update both.

```bash
npm run dev
# then open http://localhost:3000/styleguide and toggle the theme
```

The page source is `app/styleguide/page.tsx`.
