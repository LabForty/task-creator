# Design Polish — Sign-in-grade Surface Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring every surface up to the sign-in page's craft — accessible colour tokens, ambient depth, a shared brand mark, a marquee `prominent` CTA, and signature motion — applied consistently across home, editor, drafts, panels, and epic-mode screens.

**Architecture:** Foundation-first. Phase 1 ships shared infrastructure (tokens, `AmbientBackground`, `BrandMark`, `prominent` Button variant, `Skeleton` shimmer, motion helpers, contrast guard). Phases 2–6 apply that foundation per-surface. Each phase is independently shippable and screenshot-reviewed.

**Tech Stack:** Next.js 16 (App Router) · React 19 · Tailwind 3.4 (class dark mode, CSS-variable tokens) · `motion` v12 (Framer) · Vitest 4 + Testing Library (jsdom) · Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-06-15-design-polish-design.md` (approved 2026-06-15).

---

## Conventions & ground rules (read before any task)

- **Commit policy (OVERRIDES the skill's auto-commit):** Per the user's global git rules, **do NOT run `git commit`/`git push` without the user's explicit per-session authorization.** The `Commit` steps below mark logical commit points — at each one, stop and let the user commit (or confirm they've authorized commits this session). Leave the tree dirty for review otherwise.
- **Token scanner:** `npm run check:tokens` scans `.ts/.tsx` in `app/`, `components/`, `lib/` for raw hex / arbitrary colour utilities. It does **not** scan `.css`, so all new hex values live in `app/globals.css`. The only `.tsx` raw hex is `BRAND_RED` in `components/BrandMark.tsx`, which **must** carry a trailing `// design-tokens-allow: LabForty brand mark` comment (it moves with the constant from the sign-in file).
- **Per-task verification (run after every implementation step that changes `.ts/.tsx/.css`):**
  - `npm run typecheck` → expect no errors
  - `npm run lint` → expect no errors (includes `check:tokens`)
  - `npm test` → expect green (`vitest run`)
  - For surface phases also: `npm run build` → expect a successful production build, and a screenshot review (light + dark) of the touched surface.
- **Test runner:** tests live under `tests/**`, mirror the source path, use `vitest` globals + `@testing-library/react`. `tests/setup.ts` sets `MotionGlobalConfig.skipAnimations = true` and polyfills storage. Run a single file with `npx vitest run tests/path/file.test.tsx`.
- **Reduced motion:** the global `@media (prefers-reduced-motion: reduce)` rule in `globals.css` already neutralises CSS animations/transitions; `MotionRoot` sets `reducedMotion="user"`. New CSS animations inherit this automatically — never add a JS-driven loop that bypasses it.
- **`cn()`** (`lib/cn.ts`, clsx + tailwind-merge) is the className combiner used by all primitives.

## File structure map

| File | New/Modify | Responsibility |
| --- | --- | --- |
| `app/globals.css` | Modify | Token additions (`*-strong`, ink-tertiary bump); `.ambient-*`, `.cta-prominent`/`.cta-sheen`, `.hig-shimmer` blocks |
| `tailwind.config.ts` | Modify | Map `accent.strong` / `danger.strong` |
| `components/ui/Button.tsx` | Modify | `primary`→strong bg, `ghost`→strong text, new `prominent` variant (renders sheen) |
| `components/ui/Alert.tsx` | Modify | danger tone text → `danger-strong` |
| `components/ui/TextField.tsx` | Modify | field error text → `danger-strong` (TextField + TextArea) |
| `components/BrandMark.tsx` | **New** | Shared LabForty diamond mark (extracted from sign-in) |
| `components/AmbientBackground.tsx` | **New** | Static dim aurora layer for app shells |
| `components/ui/Skeleton.tsx` | **New** | Shimmer skeleton primitive |
| `lib/motion.ts` | Modify | Add `celebrate` + `crossFade` variants |
| `components/signin/SigninExperience.tsx` | Modify | Import `BrandMark` (drop local copy); error chip → `<Alert>` |
| `scripts/contrast-check.mjs` | Modify | Export helpers + tables; add `*-strong` pairs; guard CLI run |
| `tests/scripts/contrast.test.ts` | **New** | Lock AA thresholds for active token pairs |
| `tests/components/{BrandMark,AmbientBackground}.test.tsx`, `tests/components/ui/Skeleton.test.tsx`, additions to `Button.test.tsx`, `Alert.test.tsx`, `TextField.test.tsx` | New/Modify | Unit coverage for the foundation |
| `app/styleguide/page.tsx` | Modify | Document `prominent`, `*-strong`, `AmbientBackground`, shimmer |
| `components/StandaloneApp.tsx`, `components/EmbedApp.tsx` | Modify | Ambient bg + brand mark (Phase 2) |
| `components/Editor.tsx` | Modify | Hierarchy, hero empty state, `prominent` Finalize, `danger-strong` error (Phase 3) |
| `components/drafts/*` | Modify | Hero empty state, glass-strong, ambient bg, shimmer (Phase 4) |
| `components/Preview.tsx`, `JiraExport.tsx`, `RunSheet.tsx`, `AnalyzePanel.tsx`, `HelpPanel.tsx`, `DiagramView.tsx` | Modify | glass-strong, `prominent` export, success beat (Phase 5) |
| `components/epic/**` | Modify | glass-strong, `prominent` CTAs, single↔epic transition (Phase 5) |
| `docs/design-system.md`, `CHANGELOG.md` | Modify | Document new tokens/variant/depth/brand (each phase) |

---

# Phase 1 — Foundation

## Task 1: Accessible colour tokens (`*-strong`, ink-tertiary bump)

**Files:**
- Modify: `app/globals.css:10-43` (`:root`), `app/globals.css:45-78` (`html.dark`)

- [ ] **Step 1: Add the new tokens to `:root`**

In `app/globals.css`, inside `:root` add `--color-accent-strong` and `--color-danger-strong`, and change `--color-ink-tertiary`. After line 15 (`--color-accent-tint: #e9f1ff;`) add:

```css
  --color-accent-strong:  #0064d6; /* AA white-on-fill + accent-as-text (5.54) */
```

After line 17 (`--color-danger: #ff3b30;`) add:

```css
  --color-danger-strong:  #d70015; /* AA error text on surface (5.38) */
```

Change line 32 from `--color-ink-tertiary:   #86868b;` to:

```css
  --color-ink-tertiary:   #76767b;
```

- [ ] **Step 2: Add the new tokens to `html.dark`**

Inside `html.dark`, after line 50 (`--color-accent-tint: rgba(10,132,255,0.18);`) add:

```css
  --color-accent-strong:  #0a72ec; /* AA white-on-fill / accent-as-text (4.53) */
```

After line 52 (`--color-danger: #ff453a;`) add:

```css
  --color-danger-strong:  #ff453a; /* AA error text on dark surface (4.99) */
```

Leave dark `--color-ink-tertiary: #8e8e93;` unchanged (already 5.22).

- [ ] **Step 3: Verify the scanner stays clean**

Run: `npm run check:tokens`
Expected: exits 0 (globals.css is `.css`, not scanned).

- [ ] **Step 4: Commit** (see commit policy)

```bash
git add app/globals.css
git commit -m "feat(polish): add accessible accent-strong/danger-strong tokens + ink-tertiary bump"
```

## Task 2: Map the strong tokens in Tailwind

**Files:**
- Modify: `tailwind.config.ts:46-56` (colors → accent, danger)

- [ ] **Step 1: Add `strong` keys**

In `tailwind.config.ts`, change the `accent` block (lines 47-52) to include `strong`:

```ts
        accent: {
          DEFAULT: "var(--color-accent)",
          hover: "var(--color-accent-hover)",
          pressed: "var(--color-accent-pressed)",
          strong: "var(--color-accent-strong)",
          tint: "var(--color-accent-tint)",
        },
```

Change the `danger` block (lines 53-56) to include `strong`:

```ts
        danger: {
          DEFAULT: "var(--color-danger)",
          strong: "var(--color-danger-strong)",
          tint: "var(--color-danger-tint)",
        },
```

- [ ] **Step 2: Verify build picks up the classes**

Run: `npm run typecheck`
Expected: no errors. (`bg-accent-strong` / `text-danger-strong` become available utilities.)

- [ ] **Step 3: Commit**

```bash
git add tailwind.config.ts
git commit -m "feat(polish): map accent.strong/danger.strong utilities"
```

## Task 3: `Alert` + `TextField` error text → `danger-strong`

**Files:**
- Modify: `components/ui/Alert.tsx:8`
- Modify: `components/ui/TextField.tsx:40,68`
- Test: `tests/components/ui/Alert.test.tsx`, `tests/components/ui/TextField.test.tsx`

- [ ] **Step 1: Write/extend the failing tests**

Add to `tests/components/ui/Alert.test.tsx`:

```tsx
it("uses danger-strong for danger-tone text", () => {
  render(<Alert>broke</Alert>);
  expect(screen.getByRole("alert").className).toContain("text-danger-strong");
});
```

Add to `tests/components/ui/TextField.test.tsx`:

```tsx
it("renders the error message in danger-strong", () => {
  render(<TextField label="Title" error="Required" />);
  expect(screen.getByText("Required").className).toContain("text-danger-strong");
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/components/ui/Alert.test.tsx tests/components/ui/TextField.test.tsx`
Expected: FAIL — current classes use `text-danger`.

- [ ] **Step 3: Implement**

`components/ui/Alert.tsx` line 8 — change the danger tone (keep the vivid border/bg tints):

```tsx
  danger: "border-danger/30 bg-danger/5 text-danger-strong",
```

`components/ui/TextField.tsx` — change both error spans (lines 40 and 68) from `text-danger` to `text-danger-strong`:

```tsx
      {error && <span id={errorId} className="text-hig-footnote text-danger-strong">{error}</span>}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/components/ui/Alert.test.tsx tests/components/ui/TextField.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ui/Alert.tsx components/ui/TextField.tsx tests/components/ui/Alert.test.tsx tests/components/ui/TextField.test.tsx
git commit -m "feat(polish): error text uses danger-strong (Alert, TextField)"
```

## Task 4: `Button` — primary/ghost strong + `prominent` variant

**Files:**
- Modify: `app/globals.css` (append `.cta-prominent` / `.cta-sheen` block)
- Modify: `components/ui/Button.tsx`
- Test: `tests/components/ui/Button.test.tsx`

- [ ] **Step 1: Add the prominent sheen CSS**

Append to `app/globals.css` (after the existing sign-in CTA block, end of file):

```css
/* ───────────────────────── Prominent CTA (shared) ─────────────────────────
   The sign-in CTA treatment generalised for the `prominent` Button variant:
   accent-strong fill + a sheen that drifts left→right on hover. Reduced-motion
   neutralises the transition via the global rule in @layer base. */
.cta-prominent { isolation: isolate; }
.cta-sheen {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    115deg,
    transparent 30%,
    rgba(255, 255, 255, 0.35) 50%,
    transparent 70%
  );
  transform: translateX(-110%);
  transition: transform 700ms cubic-bezier(0.25, 0.1, 0.25, 1);
  pointer-events: none;
}
.cta-prominent:hover .cta-sheen { transform: translateX(110%); }
```

- [ ] **Step 2: Write the failing tests**

Add to `tests/components/ui/Button.test.tsx`:

```tsx
it("primary uses the accessible accent-strong fill", () => {
  render(<Button>Go</Button>);
  expect(screen.getByRole("button", { name: "Go" }).className).toContain("bg-accent-strong");
});
it("prominent renders a sheen element and the cta-prominent host", () => {
  render(<Button variant="prominent">Finalize</Button>);
  const btn = screen.getByRole("button", { name: "Finalize" });
  expect(btn.className).toContain("cta-prominent");
  expect(btn.className).toContain("bg-accent-strong");
  expect(btn.querySelector(".cta-sheen")).not.toBeNull();
});
it("ghost text uses accent-strong", () => {
  render(<Button variant="ghost">Link</Button>);
  expect(screen.getByRole("button", { name: "Link" }).className).toContain("text-accent-strong");
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run tests/components/ui/Button.test.tsx`
Expected: FAIL — `prominent` not in the `Variant` union; classes are `bg-accent`/`text-accent`.

- [ ] **Step 4: Implement Button changes**

In `components/ui/Button.tsx`:

Change the `Variant` type (line 7):

```tsx
type Variant = "primary" | "secondary" | "ghost" | "danger" | "success" | "warning" | "prominent";
```

Change the `variants` record (lines 24-31) — note `primary`/`ghost` updates and the new `prominent` row:

```tsx
const variants: Record<Variant, string> = {
  primary: "bg-accent-strong text-white shadow-card hover:bg-accent active:bg-accent-pressed",
  secondary: "bg-surface-muted text-ink border border-rule hover:bg-surface-inset",
  ghost: "bg-transparent text-accent-strong hover:bg-accent-tint",
  danger: "bg-danger text-white hover:opacity-90",
  success: "bg-success text-white hover:opacity-90",
  warning: "bg-warning text-white hover:opacity-90",
  // Marquee CTA: accent-strong fill, white label, hover sheen (see globals.css).
  prominent: "cta-prominent relative overflow-hidden bg-accent-strong text-white shadow-card hover:bg-accent active:bg-accent-pressed",
};
```

Change the `Button` component (lines 42-47) to destructure `children` and render the sheen for `prominent`:

```tsx
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className = "", children, ...rest },
  ref,
) {
  return (
    <button ref={ref} className={buttonClasses(variant, size, className)} {...rest}>
      {children}
      {variant === "prominent" && <span aria-hidden className="cta-sheen" />}
    </button>
  );
});
```

Change the `ButtonLink` component (lines 60-65) the same way:

```tsx
export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(function ButtonLink(
  { href, variant = "secondary", size = "md", className = "", children, ...rest },
  ref,
) {
  return (
    <Link ref={ref} href={href} className={buttonClasses(variant, size, className)} {...rest}>
      {children}
      {variant === "prominent" && <span aria-hidden className="cta-sheen" />}
    </Link>
  );
});
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run tests/components/ui/Button.test.tsx`
Expected: PASS (including the pre-existing "primary by default" test — `bg-accent-strong` still contains the substring `bg-accent`, so the legacy `toContain("bg-accent")` assertion still holds).

- [ ] **Step 6: Verify lint + types**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add components/ui/Button.tsx app/globals.css tests/components/ui/Button.test.tsx
git commit -m "feat(polish): add prominent Button variant; primary/ghost use accent-strong"
```

## Task 5: Extract `BrandMark` from the sign-in experience

**Files:**
- Create: `components/BrandMark.tsx`
- Modify: `components/signin/SigninExperience.tsx`
- Test: `tests/components/BrandMark.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/BrandMark.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { BrandMark } from "@/components/BrandMark";

describe("BrandMark", () => {
  it("renders an aria-hidden svg sized by the size prop", () => {
    const { container } = render(<BrandMark size={48} />);
    const host = container.querySelector(".labforty-mark") as HTMLElement;
    expect(host).not.toBeNull();
    expect(host.style.width).toBe("48px");
    const svg = host.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("aria-hidden")).toBe("true");
  });
  it("defaults to size 36", () => {
    const { container } = render(<BrandMark />);
    expect((container.querySelector(".labforty-mark") as HTMLElement).style.width).toBe("36px");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/components/BrandMark.test.tsx`
Expected: FAIL — `@/components/BrandMark` does not exist.

- [ ] **Step 3: Create `components/BrandMark.tsx`**

Move the mark + brand const out of the sign-in file verbatim. Create `components/BrandMark.tsx`:

```tsx
export const BRAND_RED = "#ED3B3B"; // design-tokens-allow: LabForty brand mark

/**
 * LabForty wordmark glyph — hexagonal frame interrupted by </> brackets with a
 * red diamond at its core. Strokes use currentColor so the parent's text color
 * (which switches with the theme) drives light/dark adaptation; the diamond's
 * brand red stays constant. Hover spins the frame 60°, the diamond breathes,
 * and a soft red glow blooms under the cursor (CSS in globals.css `.labforty-*`).
 */
export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <span className="labforty-mark inline-block text-ink" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width="100%" height="100%" fill="none" aria-hidden>
        <g
          className="labforty-mark__hex"
          stroke="currentColor"
          strokeWidth="4.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        >
          <path d="M 50 6 L 88 28 L 88 72 L 50 94 L 12 72 L 12 28 Z" />
          <path d="M 30 32 L 16 50 L 30 68" />
          <path d="M 70 32 L 84 50 L 70 68" />
        </g>
        <path
          className="labforty-mark__diamond"
          d="M 50 22 L 60 50 L 50 78 L 40 50 Z"
          fill={BRAND_RED}
        />
      </svg>
    </span>
  );
}
```

- [ ] **Step 4: Rewire `SigninExperience.tsx` to import it**

In `components/signin/SigninExperience.tsx`:
- Add import near the top (after line 4 `import { ThemeToggle }`):
  ```tsx
  import { BrandMark } from "@/components/BrandMark";
  ```
- Delete the local `BRAND_RED` const (line 12).
- Delete the local `LabFortyMark` function (lines 238-270).
- Replace the usage at line 118 `<LabFortyMark size={36} />` with `<BrandMark size={36} />`.

- [ ] **Step 5: Run to verify pass + no regressions**

Run: `npx vitest run tests/components/BrandMark.test.tsx && npm run typecheck && npm run lint`
Expected: PASS; types clean; `check:tokens` clean (the only raw hex is `BRAND_RED` with its allow marker).

- [ ] **Step 6: Commit**

```bash
git add components/BrandMark.tsx components/signin/SigninExperience.tsx tests/components/BrandMark.test.tsx
git commit -m "refactor(polish): extract shared BrandMark from SigninExperience"
```

## Task 6: `AmbientBackground` component + CSS

**Files:**
- Create: `components/AmbientBackground.tsx`
- Modify: `app/globals.css` (append `.ambient-*` block)
- Test: `tests/components/AmbientBackground.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/AmbientBackground.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { AmbientBackground } from "@/components/AmbientBackground";

describe("AmbientBackground", () => {
  it("renders a decorative, non-interactive, behind-content layer", () => {
    const { container } = render(<AmbientBackground />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).not.toBeNull();
    expect(root.getAttribute("aria-hidden")).toBe("true");
    expect(root.className).toContain("pointer-events-none");
    expect(root.className).toContain("-z-10");
    expect(root.className).toContain("absolute");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/components/AmbientBackground.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Create the component**

Create `components/AmbientBackground.tsx`:

```tsx
/**
 * Static, dim aurora layer for the app shell. Derived from the sign-in aurora
 * vocabulary (globals.css `.ambient-*`) but much dimmer and NOT animated, so
 * dense panels stay legible. Decorative only — aria-hidden, pointer-events-none,
 * sits at -z-10 inside a `relative` shell.
 */
export function AmbientBackground() {
  return (
    <div aria-hidden className="ambient-bg pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <span className="ambient-blob ambient-blob--a" />
      <span className="ambient-blob ambient-blob--b" />
      <span className="ambient-blob ambient-blob--c" />
      <div className="ambient-grid absolute inset-0" />
      <div className="ambient-vignette absolute inset-0" />
    </div>
  );
}
```

- [ ] **Step 4: Add the `.ambient-*` CSS**

Append to `app/globals.css` (end of file). Dimmer and static vs. the sign-in blobs (opacity ~0.22 / 0.16, larger blur, no `animation`):

```css
/* ───────────────────────── Ambient app-shell depth ─────────────────────────
   A faint, STATIC aurora behind the app grid. Calm by design — panels stay
   glass-strong and legible. Mirrors the sign-in vocabulary at much lower
   intensity and with no motion. */
.ambient-bg {
  background:
    radial-gradient(120% 80% at 50% -10%, var(--color-accent-tint) 0%, transparent 55%);
}
.ambient-blob {
  position: absolute;
  display: block;
  border-radius: 9999px;
  filter: blur(96px);
  opacity: 0.22;
  mix-blend-mode: screen;
}
html.dark .ambient-blob { opacity: 0.16; mix-blend-mode: lighten; }
.ambient-blob--a {
  width: 40rem; height: 40rem; left: -10rem; top: -12rem;
  background: radial-gradient(closest-side, #6f8cff 0%, transparent 70%);
}
.ambient-blob--b {
  width: 34rem; height: 34rem; right: -8rem; top: 25%;
  background: radial-gradient(closest-side, #b07cff 0%, transparent 70%);
}
.ambient-blob--c {
  width: 30rem; height: 30rem; left: 20%; bottom: -12rem;
  background: radial-gradient(closest-side, #4ad6ff 0%, transparent 70%);
}
.ambient-grid {
  background-image: radial-gradient(circle at 1px 1px, var(--color-rule) 1px, transparent 0);
  background-size: 22px 22px;
  opacity: 0.25;
  mask-image: radial-gradient(ellipse at center, black 35%, transparent 80%);
  -webkit-mask-image: radial-gradient(ellipse at center, black 35%, transparent 80%);
}
.ambient-vignette {
  background: radial-gradient(120% 90% at 50% 40%, transparent 45%, var(--color-surface-subtle) 95%);
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run tests/components/AmbientBackground.test.tsx && npm run lint`
Expected: PASS; `check:tokens` clean (hex lives in `.css`).

- [ ] **Step 6: Commit**

```bash
git add components/AmbientBackground.tsx app/globals.css tests/components/AmbientBackground.test.tsx
git commit -m "feat(polish): add static AmbientBackground depth layer"
```

## Task 7: `Skeleton` shimmer primitive + CSS

**Files:**
- Create: `components/ui/Skeleton.tsx`
- Modify: `app/globals.css` (append `.hig-shimmer` block)
- Test: `tests/components/ui/Skeleton.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/ui/Skeleton.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Skeleton } from "@/components/ui/Skeleton";

describe("Skeleton", () => {
  it("renders a decorative shimmer block and merges className", () => {
    const { container } = render(<Skeleton className="h-4 w-44" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.className).toContain("hig-shimmer");
    expect(el.className).toContain("h-4");
    expect(el.className).toContain("w-44");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/components/ui/Skeleton.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Create the component**

Create `components/ui/Skeleton.tsx`:

```tsx
import { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Shimmer placeholder block. Replaces static `animate-pulse` skeletons. The
 * sweep is a CSS animation (globals.css `.hig-shimmer`) that reduced-motion
 * neutralises to a flat tint. Pass sizing/shape via className (e.g. "h-4 w-44").
 */
export function Skeleton({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn("hig-shimmer rounded", className)} {...rest} />;
}
```

- [ ] **Step 4: Add the `.hig-shimmer` CSS**

Append to `app/globals.css` (end of file):

```css
/* ───────────────────────── Shimmer skeletons ─────────────────────────
   Replaces static animate-pulse. A highlight sweeps across a base tint;
   reduced-motion freezes it to the flat base via the global rule. */
.hig-shimmer {
  background-color: var(--color-surface-inset);
  background-image: linear-gradient(
    100deg,
    transparent 20%,
    color-mix(in srgb, var(--color-surface) 60%, transparent) 50%,
    transparent 80%
  );
  background-size: 200% 100%;
  background-repeat: no-repeat;
  animation: hig-shimmer-sweep 1.4s ease-in-out infinite;
}
@keyframes hig-shimmer-sweep {
  from { background-position: 150% 0; }
  to   { background-position: -50% 0; }
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run tests/components/ui/Skeleton.test.tsx && npm run lint`
Expected: PASS; scanner clean.

- [ ] **Step 6: Commit**

```bash
git add components/ui/Skeleton.tsx app/globals.css tests/components/ui/Skeleton.test.tsx
git commit -m "feat(polish): add Skeleton shimmer primitive"
```

## Task 8: Motion helpers — `celebrate` + `crossFade`

**Files:**
- Modify: `lib/motion.ts`
- Test: `tests/lib/motion.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/motion.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { celebrate, crossFade } from "@/lib/motion";

describe("motion variants", () => {
  it("celebrate defines hidden + visible with a scale beat", () => {
    expect(celebrate.hidden).toBeDefined();
    expect(celebrate.visible).toBeDefined();
  });
  it("crossFade defines hidden, visible, and exit", () => {
    expect(crossFade.hidden).toBeDefined();
    expect(crossFade.visible).toBeDefined();
    expect(crossFade.exit).toBeDefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/lib/motion.test.ts`
Expected: FAIL — `celebrate`/`crossFade` not exported.

- [ ] **Step 3: Implement**

Append to `lib/motion.ts` (after `scaleIn`):

```ts
// Success beat: a quick pop that settles. Used on export/finalize success.
export const celebrate: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: {
    opacity: 1,
    scale: [0.9, 1.04, 1],
    transition: { duration: 0.4, ease: EASE_HIG, times: [0, 0.6, 1] },
  },
};

// Single↔epic / view transition: gentle fade+rise in, fade+rise out the
// opposite way. Pair with AnimatePresence mode="wait".
export const crossFade: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease: EASE_HIG } },
  exit: { opacity: 0, y: -8, transition: { duration: DUR_FAST, ease: EASE_HIG } },
};
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/lib/motion.test.ts && npm run typecheck`
Expected: PASS; types clean.

- [ ] **Step 5: Commit**

```bash
git add lib/motion.ts tests/lib/motion.test.ts
git commit -m "feat(polish): add celebrate + crossFade motion variants"
```

## Task 9: Contrast guard — refactor script + lock thresholds in a test

**Files:**
- Modify: `scripts/contrast-check.mjs`
- Create: `tests/scripts/contrast.test.ts`

- [ ] **Step 1: Refactor the script to export helpers + tables and guard the CLI run**

Rewrite `scripts/contrast-check.mjs` so importing it has no side effects, the strong tokens are added, and the active text/button pairs assert AA. Replace the file with:

```js
// WCAG contrast audit for the design tokens. Computes contrast for the active
// foreground/background token pairs in light and dark, flagging anything below
// AA (4.5 normal / 3.0 large+UI). Token values mirror app/globals.css.
// Importable (helpers + tables exported, no side effects); run directly for the
// CLI report: `node scripts/contrast-check.mjs`.
import { fileURLToPath } from "node:url";

export function lum(hex) {
  const m = hex.replace("#", "");
  const n = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
export function ratio(fg, bg) {
  const a = lum(fg), b = lum(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

export const LIGHT = {
  surface: "#ffffff", "surface-subtle": "#fafafc", "surface-muted": "#f5f5f7",
  ink: "#1d1d1f", "ink-secondary": "#6e6e73", "ink-tertiary": "#76767b",
  accent: "#007aff", "accent-strong": "#0064d6",
  danger: "#ff3b30", "danger-strong": "#d70015", white: "#ffffff",
};
export const DARK = {
  surface: "#1c1c1e", "surface-subtle": "#0a0a0c", "surface-muted": "#2c2c2e",
  ink: "#f5f5f7", "ink-secondary": "#aeaeb2", "ink-tertiary": "#8e8e93",
  accent: "#0a84ff", "accent-strong": "#0a72ec",
  danger: "#ff453a", "danger-strong": "#ff453a", white: "#ffffff",
};

// [fg, bg, minRatio, label]. These are the ACTIVE pairs after the strong-token
// migration: colour-as-text and white-on-fill now use the *-strong values.
export const PAIRS = [
  ["ink", "surface", 4.5, "body text on card"],
  ["ink", "surface-subtle", 4.5, "body text on app bg"],
  ["ink-secondary", "surface", 4.5, "secondary text on card"],
  ["ink-tertiary", "surface", 4.5, "tertiary/eyebrow label on card"],
  ["white", "accent-strong", 4.5, "button label on accent-strong"],
  ["accent-strong", "surface", 4.5, "accent link/ghost text on card"],
  ["danger-strong", "surface", 4.5, "error text on card"],
];

export function report() {
  for (const [name, theme] of [["LIGHT", LIGHT], ["DARK", DARK]]) {
    console.log(`\n=== ${name} ===`);
    for (const [fg, bg, min, label] of PAIRS) {
      const r = ratio(theme[fg], theme[bg]);
      const passAA = r >= min;
      const passLarge = r >= 3.0;
      const status = passAA ? "PASS AA" : passLarge ? "fails AA (passes large/UI 3.0)" : "FAIL";
      console.log(
        `${r.toFixed(2).padStart(5)}  ${passAA ? "✓" : "✗"}  ${fg} on ${bg}  (need ${min})  — ${label} [${status}]`,
      );
    }
  }
}

// Only run the report when invoked directly, not when imported by a test.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  report();
}
```

- [ ] **Step 2: Verify the CLI still runs**

Run: `node scripts/contrast-check.mjs`
Expected: prints LIGHT + DARK tables, every row `✓ PASS AA`.

- [ ] **Step 3: Write the regression test**

Create `tests/scripts/contrast.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ratio, LIGHT, DARK, PAIRS } from "../../scripts/contrast-check.mjs";

describe("token contrast (AA guard)", () => {
  for (const [fg, bg, min, label] of PAIRS) {
    it(`LIGHT: ${label} (${fg} on ${bg}) clears ${min}`, () => {
      expect(ratio(LIGHT[fg], LIGHT[bg])).toBeGreaterThanOrEqual(min);
    });
    it(`DARK: ${label} (${fg} on ${bg}) clears ${min}`, () => {
      expect(ratio(DARK[fg], DARK[bg])).toBeGreaterThanOrEqual(min);
    });
  }
});
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/scripts/contrast.test.ts`
Expected: PASS — all 14 assertions green.

- [ ] **Step 5: Commit**

```bash
git add scripts/contrast-check.mjs tests/scripts/contrast.test.ts
git commit -m "test(polish): lock AA thresholds for active token pairs"
```

## Task 10: Document the foundation in `/styleguide` + docs

**Files:**
- Modify: `app/styleguide/page.tsx`
- Modify: `docs/design-system.md`, `CHANGELOG.md`

- [ ] **Step 1: Add the `prominent` variant + `*-strong` swatches + ambient/shimmer demos**

In `app/styleguide/page.tsx`:
- Add `"prominent"` to the `VARIANTS` array (line 22):
  ```tsx
  const VARIANTS = ["primary", "secondary", "ghost", "danger", "success", "warning", "prominent"] as const;
  ```
- Add `"bg-accent-strong"` and `"bg-danger-strong"` to the `COLORS` array (lines 10-14), after `"bg-accent"` and `"bg-danger"` respectively.
- Import the new components at the top:
  ```tsx
  import { AmbientBackground } from "@/components/AmbientBackground";
  import { Skeleton } from "@/components/ui/Skeleton";
  ```
- Add two new `<Section>` blocks before the closing `</div>` (after the "Error states" section, line 95):
  ```tsx
  <Section title="Depth">
    <div className="relative h-40 overflow-hidden rounded-xl border border-rule">
      <AmbientBackground />
      <Card tone="glass-strong" className="absolute inset-6 flex items-center justify-center p-5">
        <p className="text-hig-subhead">glass-strong over AmbientBackground</p>
      </Card>
    </div>
  </Section>

  <Section title="Loading (shimmer)">
    <Card className="flex flex-col gap-2.5 p-6">
      <Skeleton className="h-4 w-44" />
      <Skeleton className="h-3 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </Card>
  </Section>
  ```

- [ ] **Step 2: Verify the styleguide builds + renders**

Run: `npm run build`
Expected: successful build (the `/styleguide` route compiles). Optionally screenshot `/styleguide` light + dark.

- [ ] **Step 3: Update docs**

In `docs/design-system.md` add a section documenting: the `accent-strong`/`danger-strong` tokens (when to use vivid vs strong: vivid for fills/tints/borders/icons/aurora; strong for colour-as-text and white-on-fill buttons), the `prominent` Button variant, `AmbientBackground` (one per app shell, behind a `relative` root), and `Skeleton` (replaces `animate-pulse`).

Add a `CHANGELOG.md` entry under the current unreleased/dated heading:
```
- Design polish: accessible `accent-strong`/`danger-strong` tokens, `prominent` Button variant, `AmbientBackground` depth, `Skeleton` shimmer, shared `BrandMark`, `celebrate`/`crossFade` motion.
```

- [ ] **Step 4: Commit**

```bash
git add app/styleguide/page.tsx docs/design-system.md CHANGELOG.md
git commit -m "docs(polish): document foundation in /styleguide + design-system"
```

**Phase 1 checkpoint:** `npm run typecheck && npm run lint && npm test && npm run build` all green; screenshot-review `/signin` (unchanged) and `/styleguide` (new sections) in light + dark.

---

# Phase 2 — App shell + header (home, embed)

## Task 11: `StandaloneApp` — ambient background + brand mark

**Files:**
- Modify: `components/StandaloneApp.tsx` (root `<main>` line 1070; header lines 1072-1103; imports)

- [ ] **Step 1: Import the new components**

Add after line 31 (`import { ThemeToggle }`):

```tsx
import { AmbientBackground } from "@/components/AmbientBackground";
import { BrandMark } from "@/components/BrandMark";
```

- [ ] **Step 2: Make the shell `relative` and mount the ambient layer**

Change the root `<main>` (line 1070) to add `relative` (keep everything else):

```tsx
    <main className="relative h-screen grid grid-cols-[1fr_auto_auto] bg-surface-subtle overflow-hidden">
      <AmbientBackground />
```

(The `<AmbientBackground />` is the first child, immediately after the opening `<main>` tag and before the `<div className="flex flex-col min-w-0 min-h-0">` at line 1071. It is `absolute inset-0 -z-10`, so it does not occupy a grid track.)

- [ ] **Step 3: Add the brand mark to the header**

Insert `<BrandMark>` as the first child of the `<header>` (after line 1072, before the title `<div className="flex flex-col">` at line 1073). The header is `flex items-center gap-4`, so the mark picks up spacing automatically:

```tsx
      <header className="px-8 py-5 border-b border-rule bg-surface/80 backdrop-blur flex items-center gap-4 sticky top-0 z-10">
        <BrandMark size={32} />
        <div className="flex flex-col">
          <h1 className="text-hig-title2 leading-tight">Task Creator</h1>
          ...
```

- [ ] **Step 4: Verify the editor surface still reads above the ambient layer**

Run: `npm run typecheck && npm run lint && npm test`
Expected: clean/green.
Run: `npm run build`
Expected: successful.
Screenshot `/` light + dark — confirm: ambient depth visible but faint; editor card legible; brand mark left of the title; no layout shift in the 3-column grid.

- [ ] **Step 5: Commit**

```bash
git add components/StandaloneApp.tsx
git commit -m "feat(polish): StandaloneApp gets ambient depth + brand mark"
```

## Task 12: `EmbedApp` — ambient background + light brand header

**Files:**
- Modify: `components/EmbedApp.tsx` (root `<main>` line 61; imports)

- [ ] **Step 1: Import the new components**

Add after line 7 (`import { Alert }`):

```tsx
import { AmbientBackground } from "@/components/AmbientBackground";
import { BrandMark } from "@/components/BrandMark";
```

- [ ] **Step 2: Make the shell `relative`, mount ambient, add a light header**

Change the `EmbedInner` `<main>` (line 61) and insert ambient + a minimal brand header (no heavy chrome — embed stays light per spec). Replace lines 61-65 region:

```tsx
    <main className="relative min-h-screen overflow-hidden p-6 bg-surface-subtle">
      <AmbientBackground />
      <header className="mb-4 flex items-center gap-2.5">
        <BrandMark size={26} />
        <span className="text-hig-subhead font-semibold tracking-tight text-ink">Task Creator</span>
      </header>
      {err && (
        <Alert className="mb-4">{err}</Alert>
      )}
      <Editor namespace={namespace} onFinalize={submit} disabled={mode.kind === "running"} />
```

(Everything from the `{err && …}` block downward is unchanged except for sitting after the new header.)

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: clean/green/successful.
Screenshot the embed route light + dark — confirm faint depth, brand header, editor legible.

- [ ] **Step 4: Commit**

```bash
git add components/EmbedApp.tsx
git commit -m "feat(polish): EmbedApp gets ambient depth + light brand header"
```

**Phase 2 checkpoint:** home + embed both show ambient depth and brand; full suite + build green.

---

# Phase 3 — Editor

## Task 13: Editor — hierarchy, hero empty state, prominent Finalize, danger-strong error

**Files:**
- Modify: `components/Editor.tsx` (header lines 257-260; submit button line 355; error line 292; add a blank-draft check)
- Modify: `lib/draft/autosave.ts` (add `isBlankDraft` helper)
- Test: `tests/components/Editor.hero.test.tsx`, `tests/lib/draft/autosave.test.ts` (extend if present)

- [ ] **Step 1: Add an `isBlankDraft` helper (TDD)**

First write the helper test. Create or extend `tests/lib/draft/isBlankDraft.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { EMPTY_DRAFT, isBlankDraft } from "@/lib/draft/autosave";

describe("isBlankDraft", () => {
  it("is true for EMPTY_DRAFT", () => {
    expect(isBlankDraft(EMPTY_DRAFT)).toBe(true);
  });
  it("is false once a title is typed", () => {
    expect(isBlankDraft({ ...EMPTY_DRAFT, title: "X" })).toBe(false);
  });
});
```

Run: `npx vitest run tests/lib/draft/isBlankDraft.test.ts` → Expected: FAIL (`isBlankDraft` not exported).

- [ ] **Step 2: Implement `isBlankDraft`**

In `lib/draft/autosave.ts`, add (next to `isDirty`). Adjust the field checks to the actual `Draft` shape (title, description, acceptanceCriteria[], constraints — confirm field names in the file before writing):

```ts
/** True when the draft has no user-entered content in any field. */
export function isBlankDraft(d: Draft): boolean {
  return (
    !d.title.trim() &&
    !d.description.trim() &&
    (d.acceptanceCriteria ?? []).every((a) => !a.trim()) &&
    !(d.constraints ?? "").trim()
  );
}
```

Run: `npx vitest run tests/lib/draft/isBlankDraft.test.ts` → Expected: PASS.

- [ ] **Step 3: Write the editor hero test**

Create `tests/components/Editor.hero.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Editor } from "@/components/Editor";

describe("Editor hero empty state", () => {
  it("shows the hero headline when the draft is blank", () => {
    render(<Editor namespace="test:hero" onFinalize={() => {}} />);
    expect(screen.getByRole("heading", { name: /turn an idea into a structured task/i })).toBeInTheDocument();
  });
});
```

Run: `npx vitest run tests/components/Editor.hero.test.tsx` → Expected: FAIL.

(Note: confirm `Editor`'s required props from the file — `namespace`, `onFinalize` are present in the survey; pass any other required props the signature needs. If `Editor` reads localStorage on mount, the test setup polyfill covers it and the draft starts at `EMPTY_DRAFT`.)

- [ ] **Step 4: Implement the hero header + prominent Finalize + danger-strong error**

In `components/Editor.tsx`:

- Add `isBlankDraft` to the autosave import (line 29):
  ```tsx
  import { Draft, EMPTY_DRAFT, isBlankDraft, isDirty, loadDraft, saveDraft } from "@/lib/draft/autosave";
  ```
- Replace the header block (lines 257-260) with a conditional hero/compact header:
  ```tsx
  <header className="flex flex-col gap-1">
    <SectionLabel>Draft</SectionLabel>
    {isBlankDraft(draft) && !nested ? (
      <>
        <h1 className="text-hig-large leading-[1.1] text-ink">Turn an idea into a structured task</h1>
        <p className="mt-1 text-hig-subhead text-ink-secondary">
          Describe what needs to happen — we'll shape it into a Jira-ready story with diagrams.
        </p>
      </>
    ) : (
      <h2 className="text-hig-title3">What needs to happen?</h2>
    )}
  </header>
  ```
- Promote the Finalize button (line 355) to `prominent`:
  ```tsx
  <Button type="submit" variant="prominent" size="lg" disabled={disabled || !draft.title.trim()}>
    Finalize task
  </Button>
  ```
- Change the suggest error (line 292) to `danger-strong`:
  ```tsx
  <p className="text-hig-footnote text-danger-strong mt-1.5">{suggestErr}</p>
  ```

- [ ] **Step 5: Run to verify pass + suite**

Run: `npx vitest run tests/components/Editor.hero.test.tsx && npm run typecheck && npm run lint && npm test`
Expected: PASS / clean / green.

- [ ] **Step 6: Build + screenshot**

Run: `npm run build` → successful.
Screenshot `/` with a blank draft (hero visible) and with content typed (compact header), light + dark. Confirm the `prominent` Finalize shows the sheen on hover.

- [ ] **Step 7: Commit**

```bash
git add components/Editor.tsx lib/draft/autosave.ts tests/components/Editor.hero.test.tsx tests/lib/draft/isBlankDraft.test.ts
git commit -m "feat(polish): editor hero empty state, prominent Finalize, danger-strong error"
```

**Phase 3 checkpoint:** blank vs filled editor states both crafted; suite + build green.

---

# Phase 4 — Drafts

## Task 14: Drafts — ambient bg, hero empty state, shimmer skeleton

**Files:**
- Modify: `components/drafts/DraftsDashboard.tsx` (root line 64; imports)
- Modify: `components/drafts/DraftsView.tsx` (loading lines 23-40; empty lines 51-84; imports)
- Test: `tests/components/drafts/DraftsView.test.tsx` (extend)

- [ ] **Step 1: Ambient background behind the drafts shell**

In `components/drafts/DraftsDashboard.tsx`:
- Add import after line 4 (`import { ButtonLink }` …): `import { AmbientBackground } from "@/components/AmbientBackground";`
- Wrap the existing root so the ambient layer covers the full page. Change the root `<div>` (line 64) to a relative full-height wrapper containing the ambient layer + the existing centered column:
  ```tsx
  <div className="relative min-h-screen">
    <AmbientBackground />
    <div className="relative max-w-3xl w-full mx-auto px-6 py-8 flex flex-col gap-5">
      {/* existing header + <DraftsView …/> unchanged */}
    </div>
  </div>
  ```
  (Note: `app/drafts/page.tsx` already wraps this in `<main className="min-h-screen bg-surface-subtle">`, so the ambient layer anchors to the new `relative min-h-screen` wrapper.)

- [ ] **Step 2: Extend the drafts test for hero + shimmer**

Add to `tests/components/drafts/DraftsView.test.tsx`:

```tsx
it("empty state shows the hero headline and a prominent CTA", () => {
  render(<DraftsView state={{ kind: "empty" }} onDelete={async () => {}} onRetry={() => {}} />);
  const h = screen.getByRole("heading", { name: /no drafts yet/i });
  expect(h.className).toContain("text-hig-large");
  const cta = screen.getByRole("link", { name: /create a task/i });
  expect(cta.className).toContain("cta-prominent");
});
it("loading state uses shimmer, not animate-pulse", () => {
  const { container } = render(<DraftsView state={{ kind: "loading" }} onDelete={async () => {}} onRetry={() => {}} />);
  expect(container.querySelector(".hig-shimmer")).not.toBeNull();
  expect(container.querySelector(".animate-pulse")).toBeNull();
});
```

(Confirm the existing test file's import of `DraftsView` and the `DraftsState` shape; match the prop names used there.)

Run: `npx vitest run tests/components/drafts/DraftsView.test.tsx` → Expected: FAIL on the two new cases.

- [ ] **Step 3: Implement the hero empty state**

In `components/drafts/DraftsView.tsx`:
- Add to imports (after line 4 `import { Button, ButtonLink }`): `import { Skeleton } from "@/components/ui/Skeleton";`
- In the empty branch (lines 51-83): change the card to glass-strong, bump the headline, and promote the CTA. Change line 75 heading and line 79 CTA:
  ```tsx
  // card wrapper (line 53-58): change className "hig-card …" → "hig-glass-strong …"
  className="hig-glass-strong p-8 flex flex-col items-center gap-3 text-center"
  // headline (line 75)
  <h2 className="text-hig-large leading-tight">No drafts yet</h2>
  // CTA (line 79)
  <ButtonLink href="/" variant="prominent">
    Create a task
  </ButtonLink>
  ```

- [ ] **Step 4: Implement the shimmer loading skeleton**

In `components/drafts/DraftsView.tsx`, replace the loading branch (lines 27-39) — keep the `data-testid="drafts-loading"` and the silhouette geometry, swap `animate-pulse` bars for `<Skeleton>`:

```tsx
<div data-testid="drafts-loading" className="flex flex-col gap-3" aria-hidden>
  {[0, 1, 2].map((i) => (
    <div key={i} className="hig-card p-4 pl-6 flex flex-col gap-2.5">
      <div className="flex items-center gap-3">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-4 w-14 rounded-full" />
        <Skeleton className="ml-auto h-3 w-12" />
      </div>
      <Skeleton className="h-3 w-3/4" />
    </div>
  ))}
</div>
```

- [ ] **Step 5: Run to verify pass + suite**

Run: `npx vitest run tests/components/drafts/DraftsView.test.tsx && npm run typecheck && npm run lint && npm test`
Expected: PASS / clean / green. (Confirm the e2e drafts spec, if any, still finds `drafts-loading`.)

- [ ] **Step 6: Build + screenshot**

Run: `npm run build` → successful.
Screenshot `/drafts` in empty, loading, and loaded states, light + dark. Confirm hero on ambient bg, shimmer sweep, prominent CTA.

- [ ] **Step 7: Commit**

```bash
git add components/drafts/DraftsDashboard.tsx components/drafts/DraftsView.tsx tests/components/drafts/DraftsView.test.tsx
git commit -m "feat(polish): drafts hero empty state, ambient bg, shimmer skeleton"
```

**Phase 4 checkpoint:** drafts surface matches the hero/shimmer standard; suite + build + drafts e2e green.

---

# Phase 5 — Preview / panels + epic mode

> Pattern for this phase: swap hand-rolled `hig-card`/`bg-surface` working surfaces to the glass-strong language (use `Card tone="glass-strong"` where a new container is natural, or swap the literal class `hig-card` → `hig-glass-strong` where a container already exists), promote the marquee export/finalize CTA to `prominent`, and add the `celebrate` success beat where an export/run completes. Keep dense surfaces legible (glass-strong is 85% opaque). Each task: implement → `typecheck && lint && test && build` → screenshot.

## Task 15: `JiraExport` — prominent CTA + success beat + glass-strong

**Files:**
- Modify: `components/JiraExport.tsx` (success header lines 232-246; create-issue button lines 328-330; per-row `text-danger` lines 257/290/304/310/373/404; surface cards 240/335/441; imports)
- Test: `tests/components/JiraExport.test.tsx` (create if absent — otherwise a focused render test)

- [ ] **Step 1: Imports**

Add at the top:
```tsx
import { motion } from "motion/react";
import { celebrate } from "@/lib/motion";
```

- [ ] **Step 2: Promote the export CTA to `prominent`**

Change the create-issue button (lines 328-330):
```tsx
<Button variant="prominent" onClick={submit} disabled={!canSubmit}>
  {exporting ? "Creating…" : "Create issue"}
</Button>
```

- [ ] **Step 3: Add the success beat**

In the success view (lines 232-246), wrap the confirmation heading in a `motion.div` using `celebrate`. Change the "Exported to Jira" header area:
```tsx
<motion.div variants={celebrate} initial="hidden" animate="visible" className="flex flex-col gap-1">
  <h2 className="text-hig-title3">Exported to Jira</h2>
  <p className="text-hig-body">Created issue <strong>{result.key}</strong>.</p>
</motion.div>
```
(Keep the existing "Open in Jira →" link and `Done` button as-is.)

- [ ] **Step 4: Migrate per-row raw `text-danger` → `danger-strong`**

Change the inline failure strings at lines 257, 290, 304, 310, 373, 404 from `text-danger` to `text-danger-strong` (these are field/row-level errors that read as text; the top-level `<Alert>` usages at 337/427 already get `danger-strong` via Task 3). Example (line 373):
```tsx
<span className="text-hig-footnote text-danger-strong">{projectsErr}</span>
```

- [ ] **Step 5: glass-strong working cards**

Change the three working cards `hig-card` → `hig-glass-strong`: success card (line 240), form left card (line 335), form right preview card (line 441).

- [ ] **Step 6: Focused test**

Create `tests/components/JiraExport.test.tsx` asserting the create-issue button renders with the prominent host class. (If `JiraExport` has heavy data deps making a full render impractical, instead assert via a thin render with minimal props/mocks matching existing test patterns; otherwise cover this surface by screenshot review only and note it.)

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { JiraExport } from "@/components/JiraExport";
// NOTE: match the real required props from components/JiraExport.tsx before finalising.
describe("JiraExport CTA", () => {
  it("renders the create-issue button as a prominent CTA", () => {
    // render with the minimal props the component requires …
    // expect(screen.getByRole("button", { name: /create issue/i }).className).toContain("cta-prominent");
  });
});
```
(If full render is impractical, delete this stub and rely on the screenshot checkpoint — do not leave a non-asserting test.)

- [ ] **Step 7: Verify + build + screenshot + commit**

Run: `npm run typecheck && npm run lint && npm test && npm run build` → clean/green/successful.
Screenshot the export form + success view, light + dark. Confirm prominent CTA, success pop, glass-strong cards.
```bash
git add components/JiraExport.tsx tests/components/JiraExport.test.tsx
git commit -m "feat(polish): Jira export prominent CTA, success beat, glass-strong, danger-strong"
```

## Task 16: `Preview` — prominent export entry + glass-strong working cards

**Files:**
- Modify: `components/Preview.tsx` (export button lines 81-97; cards lines 74/131)

- [ ] **Step 1: Promote the in-page export CTA**

Change the "Export to Jira" button (lines 83-91) from `variant="secondary"` to `variant="prominent"` (keep `size="sm"`, the disabled/title logic, and the `jiraConfigured`/`jiraConnected` branching). The "Connect to Jira" branch stays `secondary`.

- [ ] **Step 2: glass-strong working cards**

Change the two working cards `hig-card` → `hig-glass-strong` (lines 74, 131).

- [ ] **Step 3: Verify + build + screenshot + commit**

Run: `npm run typecheck && npm run lint && npm test && npm run build` → clean.
Screenshot the preview/export view light + dark.
```bash
git add components/Preview.tsx
git commit -m "feat(polish): Preview prominent export entry + glass-strong surfaces"
```

## Task 17: `RunSheet` + `HelpPanel` + `AnalyzePanel` + `DiagramView` — glass-strong + run success beat

**Files:**
- Modify: `components/RunSheet.tsx` (root aside lines 143-146; finalized event row), `components/HelpPanel.tsx` (root aside lines 187-190), `components/AnalyzePanel.tsx` (root section line 39 already `hig-card`), `components/DiagramView.tsx` (empty state lines 32-38)

- [ ] **Step 1: glass-strong side panels**

- `RunSheet.tsx` (lines 143-146): change `bg-surface` on the `<aside>` → `hig-glass-strong` (drop the now-redundant `bg-surface`; keep `border-l border-rule w-[420px] h-screen flex flex-col sticky top-0 self-start`).
- `HelpPanel.tsx` (lines 187-190): same swap — `bg-surface` → `hig-glass-strong` on the `<aside>` (keep the width/transition classes).
- `AnalyzePanel.tsx` (line 39): change `hig-card` → `hig-glass-strong` on the `<section>`.

- [ ] **Step 2: Run-success beat in RunSheet**

Import motion + celebrate (`import { motion } from "motion/react"; import { celebrate } from "@/lib/motion";`). Wrap the finalized event's check badge (the `check` icon `<li>`, lines 166-177 region, gated to the finalized event lines 63-64) in `motion.span variants={celebrate} initial="hidden" animate="visible"` so the green check pops when finalize completes. Keep all other event rows static.

- [ ] **Step 3: DiagramView empty state legibility**

`DiagramView.tsx` (lines 32-38): keep it text-only but ensure it uses `text-ink-secondary` (already does) — no change required unless screenshot shows it reads as a void; if so wrap in a centered `Card tone="glass-strong"`. Decide at screenshot review.

- [ ] **Step 4: Verify + build + screenshot + commit**

Run: `npm run typecheck && npm run lint && npm test && npm run build` → clean.
Screenshot a running finalize (RunSheet), the help panel, and the analyze panel, light + dark. Confirm glass-strong panels over ambient bg and the success pop.
```bash
git add components/RunSheet.tsx components/HelpPanel.tsx components/AnalyzePanel.tsx components/DiagramView.tsx
git commit -m "feat(polish): glass-strong panels + run-success beat"
```

## Task 18: Epic mode — glass-strong surfaces + prominent CTAs + single↔epic transition

**Files:**
- Modify: `components/epic/KneadingPanel.tsx` (root aside line 34; Generate line 69 / Knead line 116), `components/epic/EpicEditingView.tsx` (Bake button line 76), `components/epic/bake/BakeNav.tsx` (root aside line 35; Upload-all line 73), `components/epic/review/UploadSheet.tsx` (root aside line 171; Start-upload line 279; raw `text-danger` lines 187/201/215/260/348), `components/StandaloneApp.tsx` (single↔epic transition around lines 1120/1159/1352)

- [ ] **Step 1: glass-strong epic panels**

- `KneadingPanel.tsx` (line 34): `bg-surface` → `hig-glass-strong` on the `<aside>` (keep `w-[380px] shrink-0 border-l border-rule h-full overflow-y-auto p-4 flex flex-col gap-3`).
- `BakeNav.tsx` (line 35): `bg-surface` → `hig-glass-strong` on the `<aside>`.
- `UploadSheet.tsx` (line 171): `bg-surface` → `hig-glass-strong` on the slide-over `<aside>` (keep `fixed right-0 top-0 h-screen w-[480px] border-l border-rule shadow-lg z-30 flex flex-col`).

- [ ] **Step 2: Promote epic marquee CTAs to `prominent`**

- `EpicEditingView.tsx` line 76 — **Bake**: add `variant="prominent"` (keep `size="sm"`, disabled logic).
- `KneadingPanel.tsx` line 69 — **Generate sub-tasks**: add `variant="prominent"`.
- `KneadingPanel.tsx` line 116 — **Knead**: add `variant="prominent"`.
- `BakeNav.tsx` line 73 — **Upload all to Jira**: add `variant="prominent"`.
- `UploadSheet.tsx` line 279 — **Start upload**: add `variant="prominent"`.
- Leave the `TaskReviewBar` approve/deny/request-change toggle group as-is (it encodes selection state via colour — `prominent` would break that semantics).

- [ ] **Step 3: Migrate epic raw `text-danger` → `danger-strong`**

`UploadSheet.tsx` lines 187, 201, 215, 260, 348 and `TaskReviewBar.tsx` line 68: change `text-danger` → `text-danger-strong`.

- [ ] **Step 4: single↔epic transition**

In `components/StandaloneApp.tsx`, wrap the mutually-exclusive main-content branches (single editor vs `EpicEditingView` vs `BakeView` vs `KneadingPanel`) in `<AnimatePresence mode="wait">` with a keyed `motion.div variants={crossFade}` per branch so switching modes cross-fades. Import `import { AnimatePresence, motion } from "motion/react";` and `import { crossFade } from "@/lib/motion";`. Key each branch by a stable string (e.g. `key="single" | "epic-edit" | "bake" | "knead"`). Keep `reducedMotion="user"` behaviour (already global via MotionRoot — the y-shift is suppressed, opacity remains).

- [ ] **Step 5: Verify + build + screenshot + commit**

Run: `npm run typecheck && npm run lint && npm test && npm run build` → clean.
Screenshot epic editing, kneading, bake, and upload-sheet states light + dark; verify the single↔epic switch cross-fades.
```bash
git add components/epic components/StandaloneApp.tsx
git commit -m "feat(polish): epic-mode glass-strong, prominent CTAs, single↔epic transition"
```

**Phase 5 checkpoint:** all working surfaces share the glass-strong language over ambient depth; marquee CTAs are prominent; export/run success has a beat; mode switch animates. Suite + build + e2e green.

---

# Phase 6 — Empty / error / loading sweep

## Task 19: Replace remaining static skeletons with shimmer

**Files:**
- Modify: `components/Editor.tsx` (dynamic-import skeleton line 24)

- [ ] **Step 1: Editor rich-text loading skeleton → shimmer**

In `components/Editor.tsx`, the dynamic import's `loading` block (lines 21-26) renders `<div className="… min-h-[320px] animate-pulse" />`. Replace the `animate-pulse` placeholder with the `Skeleton` primitive (import `Skeleton` from `@/components/ui/Skeleton`):
```tsx
loading: () => (
  <div className="flex flex-col gap-1.5">
    <span className="text-hig-subhead font-medium text-ink">Description</span>
    <Skeleton className="min-h-[320px] w-full rounded-md" />
  </div>
),
```

- [ ] **Step 2: Audit other `animate-pulse` — decide per element**

The remaining `animate-pulse` uses are *activity beacons / typing dots*, not placeholder skeletons: `Preview.tsx:173,195` (loader dots), `HelpPanel.tsx:315-317` (typing indicator), `RunSheet.tsx:151,187-189` + `:182` spinner. **Leave these as-is** — they are intentional live-activity affordances, not content placeholders, and shimmer does not apply. Log this decision (do not silently convert them).

- [ ] **Step 3: Verify + commit**

Run: `npm run typecheck && npm run lint && npm test && npm run build` → clean.
```bash
git add components/Editor.tsx
git commit -m "feat(polish): editor description loader uses shimmer skeleton"
```

## Task 20: Error-text consistency sweep (`danger-strong` / `<Alert>`)

**Files:**
- Modify: `components/signin/SigninExperience.tsx` (error chip lines 167-174), `components/MermaidDiagram.tsx:66`, `components/TaskTypePicker.tsx:92`, `components/jira-metadata/{EpicField,AttachmentsField,LinkedIssuesField,LabelsField}.tsx`, `components/epic/bake/BakeNav.tsx:66`

- [ ] **Step 1: Sign-in error chip → `<Alert>`**

In `SigninExperience.tsx`, replace the hand-rolled error chip (lines 167-174) with the shared primitive (import `Alert` from `@/components/ui/Alert`):
```tsx
{niceError && <Alert className="mt-5">{niceError}</Alert>}
```
(This inherits `danger-strong` text from Task 3 and removes the last hand-rolled alert recipe.)

- [ ] **Step 2: Remaining raw `text-danger` text → `danger-strong`**

Change `text-danger` → `text-danger-strong` for these *text* occurrences (leave `bg-danger`/`border-danger` fills and hover/icon affordances untouched):
- `MermaidDiagram.tsx:66` (syntax-error label)
- `TaskTypePicker.tsx:92` (template load error)
- `jira-metadata/EpicField.tsx:39`, `AttachmentsField.tsx:93`, `LinkedIssuesField.tsx:119`, `LabelsField.tsx:90` (load-error rows)
- `BakeNav.tsx:66` (failed glyph)

Do **not** change status-badge maps (`AnalyzePanel.tsx:23`, `HelpPanel.tsx:40`, `EpicTaskCard.tsx:51`) or destructive-hover affordances (`ACList.tsx:106`, `EpicTaskCard.tsx:139`) — those are fills/affordances, not error text.

- [ ] **Step 3: Verify + commit**

Run: `npm run typecheck && npm run lint && npm test && npm run build` → clean.
Screenshot `/signin` with a forced error (e.g. `?error=session_expired`) to confirm the `<Alert>` renders identically.
```bash
git add components/signin/SigninExperience.tsx components/MermaidDiagram.tsx components/TaskTypePicker.tsx components/jira-metadata components/epic/bake/BakeNav.tsx
git commit -m "feat(polish): unify error text on Alert/danger-strong"
```

## Task 21: Empty-state polish for primary panels

**Files:**
- Modify: `components/Preview.tsx` (no-diagrams placeholder lines 161-167), `components/AnalyzePanel.tsx` (no-findings lines 65-69), `components/HelpPanel.tsx` (first-open lines 233-243)

- [ ] **Step 1: Decide scope at screenshot review**

These three are *primary* panel empty states (good hero candidates); the dropdown/listbox one-liners (Labels/Epics/LinkedIssues/projects empties) **stay compact** — do not hero them. For each of the three, review the current screenshot; if it reads as a flat void, give it the hero treatment: center it, use `text-hig-title3`/`text-hig-body`, and (Preview only) keep the inline `Create diagrams` affordance. No new CTA buttons unless the surface already has the action.

- [ ] **Step 2: Apply minimal hero treatment**

Example for `Preview.tsx` no-diagrams (lines 161-167) — keep copy, improve presence (centered, glass-strong inset):
```tsx
<div className="m-auto max-w-sm rounded-xl bg-surface-muted/60 px-5 py-6 text-center text-hig-footnote text-ink-secondary">
  No diagrams yet. Click <strong className="text-ink">Create diagrams</strong> to generate the flow, sequence, and interaction views.
</div>
```
Apply analogous light-touch centering to `AnalyzePanel` no-findings (lines 65-69) and `HelpPanel` first-open (lines 233-243). Keep them calm — these are not full-page heroes.

- [ ] **Step 3: Verify + commit**

Run: `npm run typecheck && npm run lint && npm test && npm run build` → clean.
Screenshot each panel's empty state light + dark.
```bash
git add components/Preview.tsx components/AnalyzePanel.tsx components/HelpPanel.tsx
git commit -m "feat(polish): calmer, centered empty states for primary panels"
```

## Task 22: Final pass — docs, CHANGELOG, full regression

**Files:**
- Modify: `docs/design-system.md`, `CHANGELOG.md`

- [ ] **Step 1: Finalise docs**

Ensure `docs/design-system.md` documents: depth (`AmbientBackground`, one per shell behind a `relative` root), glass-strong as the working-surface standard, `prominent` for marquee CTAs only, the `celebrate`/`crossFade` motion beats, and the error-text rule (`<Alert>` or `danger-strong`, never raw `text-danger`). Confirm the `CHANGELOG.md` entry from Task 10 covers all phases (append surface coverage if needed).

- [ ] **Step 2: Full regression**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: all clean/green/successful.
Run: `npm run test:e2e` (styleguide + drafts specs)
Expected: green. (If the pre-existing finalize/export-metadata e2e failures noted in project memory surface, confirm they are unrelated to this work and unchanged.)

- [ ] **Step 3: Screenshot diff review**

Capture light + dark of every surface (`/signin`, `/`, `/drafts`, `/styleguide`, editor blank+filled, preview/export, run, help, analyze, epic editing/knead/bake/upload) and compare against the Phase-0 baselines in `design-review/`. Confirm: ambient depth is faint and panels stay legible; brand mark consistent; prominent CTAs only on marquee actions; no contrast regressions.

- [ ] **Step 4: Commit**

```bash
git add docs/design-system.md CHANGELOG.md
git commit -m "docs(polish): finalise design-system + changelog for surface polish"
```

**Phase 6 checkpoint / done:** every empty, error, and loading state matches the standard; full suite + build + e2e green; screenshots reviewed.

---

## Self-review notes (author)

- **Spec coverage:** Phase 1 ↔ Tasks 1–10 (tokens, Button incl. prominent, Alert/TextField, BrandMark, AmbientBackground, motion, Skeleton, contrast guard, styleguide/docs). Phase 2 ↔ 11–12. Phase 3 ↔ 13. Phase 4 ↔ 14. Phase 5 ↔ 15–18. Phase 6 ↔ 19–22. The spec's testing strategy (contrast regression test, unit tests for BrandMark/AmbientBackground/prominent, styleguide additions, docs/CHANGELOG) is in Tasks 4–10 and 22.
- **Deviation from spec phasing:** the spec lists "promote Finalize to prominent" under Phase 2; because the Finalize `<Button>` physically lives in `components/Editor.tsx`, that one-line promotion is done in Phase 3 (Task 13) to keep all Editor edits in one task. All other phase mappings match the spec.
- **Type consistency:** `prominent` is added to `Variant` (Task 4) before any surface uses it (Tasks 13, 15–18). `isBlankDraft`, `celebrate`, `crossFade`, `Skeleton`, `AmbientBackground`, `BrandMark` are all defined in Phase 1 before consumption.
- **Things to confirm during execution (flagged, not placeholders):** the exact `Draft` field names for `isBlankDraft` (Task 13 Step 2); the real required props of `Editor`/`JiraExport`/`DraftsView` when writing render tests (match each component's signature); and whether a full `JiraExport` render is practical (Task 15 Step 6) — if not, drop the stub and rely on the screenshot checkpoint rather than leaving a non-asserting test.
