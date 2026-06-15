# Task Creator Design Unification (AI-51) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **⚠ Commit policy (overrides skill default):** The repo owner commits manually. Each task ends with a **checkpoint**: stage nothing, run the verification commands, show the diff, and STOP for the user to review/commit. Do **not** run `git add`/`git commit` unless the user explicitly says so. The `git` blocks below are written as the commit the *user* will make.

**Goal:** Bring the task-creator UI into full conformance with the sign-in page's design language, formalise the existing token system into shared primitives + a living `/styleguide`, publish an in-repo design pattern guide, and add an automated check that bans raw hex / magic numbers going forward.

**Architecture:** Primitive-first. Phase 1 adds foundation utilities (a `cn()` class merger, named glass-surface classes, and a token-check script that doubles as the conformance worklist). Phase 2 upgrades the shared `components/ui/` primitives so the sign-in language lives in one place. Phase 3 adopts those primitives across surfaces (header, editor, drafts, diagrams, panels). Phase 4 ships the `/styleguide` route, the Markdown guide, README/CHANGELOG, and wires the token check as a blocking gate.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v3.4 (class-based dark mode, CSS-variable tokens in `app/globals.css`) · Vitest + Testing Library (jsdom) · Playwright e2e · Framer Motion (`motion` v12, vocabulary in `lib/motion.ts`).

**Reference design:** `components/signin/SigninExperience.tsx` — its glass card, type ramp, accent CTA, danger error chip, and `ease-hig` motion are the canonical language. Spec: `docs/superpowers/specs/2026-06-12-ai-51-design-unification-design.md`.

**Existing token system (do not reinvent):** semantic colours (`accent`/`ink`/`surface`/`rule`/`danger`/`warning`/`success`), type ramp (`hig-caption`→`hig-large`), radii (`sm`/`md`/`lg`/`xl`), shadows (`shadow-card`/`shadow-elevated`/`shadow-focus`), `ease-hig` curve — all in `tailwind.config.ts` + `app/globals.css`.

---

## File map

**Create:**
- `lib/cn.ts` — class-name merge helper (clsx + tailwind-merge)
- `scripts/check-tokens.mjs` — token-conformance scanner (`findViolations` + CLI)
- `components/ui/Card.tsx` — `Card` / glass surface primitive
- `components/ui/Alert.tsx` — `Alert` / error-chip primitive
- `components/ui/SectionLabel.tsx` — eyebrow label primitive
- `app/styleguide/page.tsx` — living style guide route
- `docs/design-system.md` — the design pattern guide
- `CHANGELOG.md` — changelog (none exists)
- Tests: `tests/lib/cn.test.ts`, `tests/scripts/check-tokens.test.ts`, `tests/components/ui/Card.test.tsx`, `tests/components/ui/Alert.test.tsx`, `tests/components/ui/SectionLabel.test.tsx`, `tests/components/ui/SegmentedControl.test.tsx`, `e2e/styleguide.spec.ts`

**Modify:**
- `package.json` — add deps + `check:tokens` script
- `app/globals.css` — add `.hig-glass` / `.hig-glass-strong` component classes
- `components/ui/Button.tsx` — `shadow-card`, `cn()`, add `ButtonLink`
- `components/ui/TextField.tsx` — `cn()`, `error` state
- `components/ui/SegmentedControl.tsx` — `rounded-md`, `shadow-card`, `cn()`
- `components/FlowGraphEditor.tsx` — replace `#fff`/`#cbd5e1` with token vars
- `components/StandaloneApp.tsx` — header type, `ButtonLink`, `Alert`
- `components/drafts/DraftsView.tsx`, `DraftCard.tsx`, `DraftsDashboard.tsx` — `ButtonLink`
- `components/Editor.tsx` — glass card + section labels
- `app/api/jira/callback/route.ts` — inline CSS → token values
- Long-tail components flagged by `check:tokens` (epic mode, panels, `EditDiffView`, `MermaidDiagram`, `BakeNav`, `AnalyzePanel`, `RunSheet`, `EpicTaskCard`, `HelpPanel`)
- `README.md` — "Design system" section + "Where things live" row

---

# Phase 1 — Foundation: tokens & utilities

### Task 1: Add the `cn()` class-merge helper

**Files:**
- Modify: `package.json` (dependencies)
- Create: `lib/cn.ts`
- Test: `tests/lib/cn.test.ts`

- [ ] **Step 1: Install dependencies**

Run:
```bash
npm install clsx tailwind-merge
```
Expected: `clsx` and `tailwind-merge` added to `dependencies` in `package.json`; `npm install` exits 0.

- [ ] **Step 2: Write the failing test**

Create `tests/lib/cn.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { cn } from "@/lib/cn";

describe("cn", () => {
  it("joins truthy class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });
  it("drops falsy values", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b");
  });
  it("supports conditional object syntax", () => {
    expect(cn("a", { b: true, c: false })).toBe("a b");
  });
  it("dedupes conflicting tailwind utilities (last wins)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-ink", "text-accent")).toBe("text-accent");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/lib/cn.test.ts`
Expected: FAIL — `Cannot find module '@/lib/cn'`.

- [ ] **Step 4: Implement `lib/cn.ts`**

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge conditional class names and resolve conflicting Tailwind utilities
 * (last one wins). The single class-composition helper for the app — prefer
 * this over hand-built template strings in variant-heavy components.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/lib/cn.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Checkpoint (user commits)**

```bash
git add package.json package-lock.json lib/cn.ts tests/lib/cn.test.ts
git commit -m "feat(AI-51): add cn() class-merge helper"
```

---

### Task 2: Add named glass-surface classes

**Files:**
- Modify: `app/globals.css` (the `@layer components` block, currently lines ~106-113)

- [ ] **Step 1: Add the glass classes**

In `app/globals.css`, replace the existing `@layer components { … }` block:
```css
@layer components {
  .hig-card {
    @apply bg-surface rounded-lg shadow-card;
  }
  .hig-section-label {
    @apply text-hig-caption uppercase tracking-wider text-ink-tertiary font-semibold;
  }
}
```
with:
```css
@layer components {
  .hig-card {
    @apply bg-surface rounded-lg shadow-card;
  }
  .hig-section-label {
    @apply text-hig-caption uppercase tracking-wider text-ink-tertiary font-semibold;
  }
  /* Sign-in card treatment, named once. Use on spacious / light-touch
     surfaces (headers, empty states, dialogs). */
  .hig-glass {
    @apply rounded-xl border border-rule bg-surface/70 shadow-elevated backdrop-blur-xl;
  }
  /* Higher-opacity glass for dense working surfaces where legibility wins
     (editor, panels). Same language, calmer. */
  .hig-glass-strong {
    @apply rounded-xl border border-rule bg-surface/85 shadow-elevated backdrop-blur-xl;
  }
}
```

- [ ] **Step 2: Verify build + types (CSS-only change has no unit test)**

Run: `npm run build`
Expected: build succeeds; no Tailwind "class does not exist" warnings for `hig-glass`/`hig-glass-strong`. (Visual verification happens in Task 16 via `/styleguide`.)

- [ ] **Step 3: Checkpoint (user commits)**

```bash
git add app/globals.css
git commit -m "feat(AI-51): add named glass-surface classes (hig-glass, hig-glass-strong)"
```

---

### Task 3: Token-conformance scanner

Built early so its output is the conformance worklist for Phase 3. It is **not** wired as a blocking gate until Task 19 — until then it only reports.

**Files:**
- Create: `scripts/check-tokens.mjs`
- Modify: `package.json` (scripts)
- Test: `tests/scripts/check-tokens.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/scripts/check-tokens.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { findViolations } from "../../scripts/check-tokens.mjs";

describe("findViolations", () => {
  it("flags a raw hex colour in a className", () => {
    const v = findViolations('foo.tsx', '<div className="bg-[#ff0000]" />');
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe("arbitrary-color");
  });
  it("flags a bare hex literal", () => {
    const v = findViolations('foo.tsx', 'const c = "#1a1a1a";');
    expect(v.map((x) => x.rule)).toContain("raw-hex");
  });
  it("flags an arbitrary font-size utility", () => {
    const v = findViolations('foo.tsx', 'className="text-[12px]"');
    expect(v.map((x) => x.rule)).toContain("arbitrary-text-size");
  });
  it("ignores defensible layout dimensions", () => {
    expect(findViolations('foo.tsx', 'className="w-[420px] min-h-[320px] max-w-[480px]"')).toHaveLength(0);
  });
  it("ignores lines marked with the allow comment", () => {
    expect(findViolations('foo.tsx', 'fill="#ED3B3B" // design-tokens-allow: brand')).toHaveLength(0);
  });
  it("passes clean token-based code", () => {
    expect(findViolations('foo.tsx', '<div className="bg-surface text-ink text-hig-body" />')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scripts/check-tokens.test.ts`
Expected: FAIL — cannot find `../../scripts/check-tokens.mjs`.

- [ ] **Step 3: Implement `scripts/check-tokens.mjs`**

```js
// Token-conformance scanner for AI-51. Flags raw colour/type values that
// should be expressed as design tokens or utilities. Layout dimensions
// (widths/heights/insets) and line-heights are intentionally NOT flagged —
// they are defensible per the design spec. Lines may opt out with a trailing
// `// design-tokens-allow: <reason>` comment.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ALLOW_MARKER = "design-tokens-allow";
const SCAN_DIRS = ["app", "components", "lib"];
const SCAN_EXT = new Set([".ts", ".tsx"]);

// Layout-ish arbitrary utilities that are allowed (dimensions, position, lines).
const LAYOUT_PREFIX = /^(w|h|min-w|max-w|min-h|max-h|size|top|bottom|left|right|inset|gap|translate-x|translate-y|leading|basis)-\[/;

const RULES = [
  // bg-[#fff], text-[#abc], border-[#…], fill-[…], stroke-[…], shadow-[…], ring-[…]
  { rule: "arbitrary-color", re: /\b(?:bg|text|border|fill|stroke|shadow|ring|from|to|via|outline)-\[(?:#|rgb|rgba|hsl)[^\]]*\]/g },
  // text-[12px], text-[1.1rem] — arbitrary font sizes that should map to the hig ramp
  { rule: "arbitrary-text-size", re: /\btext-\[\d[^\]]*\]/g },
  // rounded-[7px] — arbitrary radius
  { rule: "arbitrary-radius", re: /\brounded-(?:[a-z]+-)?\[[^\]]*\]/g },
  // bare hex literals: #abc, #aabbcc, #aabbccdd (3/6/8 digits)
  { rule: "raw-hex", re: /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g },
];

export function findViolations(file, content) {
  const out = [];
  const lines = content.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (line.includes(ALLOW_MARKER)) return;
    for (const { rule, re } of RULES) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line)) !== null) {
        // Skip layout arbitraries that happen to look like a match boundary.
        if (LAYOUT_PREFIX.test(m[0])) continue;
        out.push({ file, line: i + 1, rule, match: m[0] });
      }
    }
  });
  return out;
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(p, acc);
    } else if (SCAN_EXT.has(extname(p))) {
      acc.push(p);
    }
  }
  return acc;
}

// CLI: scan repo, print violations, exit 1 if any.
function main() {
  const files = SCAN_DIRS.flatMap((d) => {
    try { return walk(d); } catch { return []; }
  });
  let total = 0;
  for (const f of files) {
    const v = findViolations(f, readFileSync(f, "utf8"));
    for (const x of v) {
      total++;
      console.log(`${x.file}:${x.line}  [${x.rule}]  ${x.match}`);
    }
  }
  if (total > 0) {
    console.error(`\n✗ ${total} token violation(s). Replace with design tokens, or mark intentional brand/decorative values with "// ${ALLOW_MARKER}: <reason>".`);
    process.exit(1);
  }
  console.log("✓ No token violations.");
}

// Run main only when invoked directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) main();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/scripts/check-tokens.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Add the npm script**

In `package.json` `scripts`, add after `"typecheck"`:
```json
    "check:tokens": "node scripts/check-tokens.mjs",
```

- [ ] **Step 6: Run the scanner to produce the conformance worklist**

Run: `npm run check:tokens`
Expected: exits 1 and prints the current violations — keep this output; it is the Phase 3 worklist. Expected offenders include `components/FlowGraphEditor.tsx` (raw-hex), `components/ui/Button.tsx` + `components/ui/SegmentedControl.tsx` (arbitrary-color shadow), `components/ui/SegmentedControl.tsx` (arbitrary-radius), and ~9 `arbitrary-text-size` hits (`EditDiffView`, `MermaidDiagram`, `BakeNav`, `EpicTaskCard`, `HelpPanel`, `AnalyzePanel`, `RunSheet`).

- [ ] **Step 7: Checkpoint (user commits)**

```bash
git add scripts/check-tokens.mjs tests/scripts/check-tokens.test.ts package.json
git commit -m "feat(AI-51): add token-conformance scanner (check:tokens)"
```

---

# Phase 2 — Shared primitives

### Task 4: Button — token shadow, `cn()`, and `ButtonLink`

**Files:**
- Modify: `components/ui/Button.tsx`
- Test: `tests/components/ui/Button.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/ui/Button.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button, ButtonLink } from "@/components/ui/Button";

describe("Button", () => {
  it("renders a button with the primary variant by default", () => {
    render(<Button>Go</Button>);
    const btn = screen.getByRole("button", { name: "Go" });
    expect(btn.className).toContain("bg-accent");
    expect(btn.className).toContain("shadow-card");
  });
  it("merges custom className without duplicating padding (cn)", () => {
    render(<Button className="px-8">Go</Button>);
    const btn = screen.getByRole("button", { name: "Go" });
    expect(btn.className).toContain("px-8");
    expect(btn.className).not.toContain("px-3.5");
  });
});

describe("ButtonLink", () => {
  it("renders an anchor with button styling and href", () => {
    render(<ButtonLink href="/drafts">Drafts</ButtonLink>);
    const link = screen.getByRole("link", { name: "Drafts" });
    expect(link).toHaveAttribute("href", "/drafts");
    expect(link.className).toContain("inline-flex");
  });
  it("applies the secondary variant classes", () => {
    render(<ButtonLink href="/x" variant="secondary">X</ButtonLink>);
    expect(screen.getByRole("link", { name: "X" }).className).toContain("bg-surface-muted");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/ui/Button.test.tsx`
Expected: FAIL — `ButtonLink` is not exported / `shadow-card` not present (`md` size still applies `px-3.5` because there is no `cn`).

- [ ] **Step 3: Rewrite `components/ui/Button.tsx`**

```tsx
"use client";

import { AnchorHTMLAttributes, ButtonHTMLAttributes, forwardRef } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success" | "warning";
type Size = "sm" | "md" | "lg";

// HIG: corner-rounded "pill-shape-lite", subtle elevation on primary, no chrome on secondary.
const base =
  "inline-flex items-center justify-center gap-1.5 rounded-md font-medium " +
  "transition-all duration-150 ease-hig " +
  "disabled:opacity-40 disabled:pointer-events-none " +
  "focus-visible:outline-none focus-visible:shadow-focus " +
  "active:scale-[0.985]";

const sizes: Record<Size, string> = {
  sm: "h-7 px-2.5 text-hig-footnote",
  md: "h-9 px-3.5 text-hig-subhead",
  lg: "h-11 px-5 text-hig-body",
};

const variants: Record<Variant, string> = {
  primary: "bg-accent text-white shadow-card hover:bg-accent-hover active:bg-accent-pressed",
  secondary: "bg-surface-muted text-ink border border-rule hover:bg-surface-inset",
  ghost: "bg-transparent text-accent hover:bg-accent-tint",
  danger: "bg-danger text-white hover:opacity-90",
  success: "bg-success text-white hover:opacity-90",
  warning: "bg-warning text-white hover:opacity-90",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className = "") {
  return cn(base, sizes[size], variants[variant], className);
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className = "", ...rest },
  ref,
) {
  return <button ref={ref} className={buttonClasses(variant, size, className)} {...rest} />;
});

type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  variant?: Variant;
  size?: Size;
};

/**
 * A link rendered with button styling. Replaces the hand-rolled
 * "link styled as a button" className strings that were duplicated across
 * the header and drafts surfaces.
 */
export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(function ButtonLink(
  { href, variant = "secondary", size = "md", className = "", ...rest },
  ref,
) {
  return <Link ref={ref} href={href} className={buttonClasses(variant, size, className)} {...rest} />;
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/ui/Button.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Regression — existing consumers still pass**

Run: `npx vitest run tests/components/drafts tests/components/StandaloneApp.test.tsx`
Expected: PASS (Button is consumed there; signature is unchanged).

- [ ] **Step 6: Checkpoint (user commits)**

```bash
git add components/ui/Button.tsx tests/components/ui/Button.test.tsx
git commit -m "feat(AI-51): Button uses shadow-card + cn, add ButtonLink"
```

---

### Task 5: `Card` / glass surface primitive

**Files:**
- Create: `components/ui/Card.tsx`
- Test: `tests/components/ui/Card.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/ui/Card.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "@/components/ui/Card";

describe("Card", () => {
  it("defaults to the solid (hig-card) tone", () => {
    render(<Card>body</Card>);
    expect(screen.getByText("body").className).toContain("hig-card");
  });
  it("applies glass tone", () => {
    render(<Card tone="glass">body</Card>);
    expect(screen.getByText("body").className).toContain("hig-glass");
  });
  it("applies strong glass tone", () => {
    render(<Card tone="glass-strong">body</Card>);
    expect(screen.getByText("body").className).toContain("hig-glass-strong");
  });
  it("merges custom className", () => {
    render(<Card className="p-8">body</Card>);
    expect(screen.getByText("body").className).toContain("p-8");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/ui/Card.test.tsx`
Expected: FAIL — `Cannot find module '@/components/ui/Card'`.

- [ ] **Step 3: Implement `components/ui/Card.tsx`**

```tsx
import { HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

type Tone = "solid" | "glass" | "glass-strong";

const tones: Record<Tone, string> = {
  solid: "hig-card",
  glass: "hig-glass",
  "glass-strong": "hig-glass-strong",
};

type Props = HTMLAttributes<HTMLDivElement> & { tone?: Tone };

/**
 * Surface primitive. `solid` = opaque hig-card (dense data). `glass` = the
 * sign-in card treatment (spacious / light-touch). `glass-strong` = higher
 * opacity for dense working surfaces that still want the glass language.
 */
export const Card = forwardRef<HTMLDivElement, Props>(function Card(
  { tone = "solid", className = "", ...rest },
  ref,
) {
  return <div ref={ref} className={cn(tones[tone], className)} {...rest} />;
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/ui/Card.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Checkpoint (user commits)**

```bash
git add components/ui/Card.tsx tests/components/ui/Card.test.tsx
git commit -m "feat(AI-51): add Card surface primitive with tone prop"
```

---

### Task 6: `Alert` / error-chip primitive

**Files:**
- Create: `components/ui/Alert.tsx`
- Test: `tests/components/ui/Alert.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/ui/Alert.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Alert } from "@/components/ui/Alert";

describe("Alert", () => {
  it("renders with role=alert and the message", () => {
    render(<Alert>Something broke</Alert>);
    const el = screen.getByRole("alert");
    expect(el).toHaveTextContent("Something broke");
  });
  it("uses danger tone styling by default", () => {
    render(<Alert>err</Alert>);
    const el = screen.getByRole("alert");
    expect(el.className).toContain("border-danger/30");
    expect(el.className).toContain("text-danger");
  });
  it("supports an accent (info) tone", () => {
    render(<Alert tone="accent">info</Alert>);
    expect(screen.getByRole("alert").className).toContain("bg-accent-tint");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/ui/Alert.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `components/ui/Alert.tsx`**

```tsx
import { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Tone = "danger" | "warning" | "success" | "accent";

// Mirrors the sign-in error chip language (border-danger/30 bg-danger/5 …).
const tones: Record<Tone, string> = {
  danger: "border-danger/30 bg-danger/5 text-danger",
  warning: "border-warning/30 bg-warning/5 text-warning",
  success: "border-success/30 bg-success/5 text-success",
  accent: "border-accent/30 bg-accent-tint text-accent",
};

type Props = HTMLAttributes<HTMLDivElement> & { tone?: Tone };

export function Alert({ tone = "danger", className = "", children, ...rest }: Props) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-md border px-4 py-2.5 text-hig-footnote",
        tones[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/ui/Alert.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Checkpoint (user commits)**

```bash
git add components/ui/Alert.tsx tests/components/ui/Alert.test.tsx
git commit -m "feat(AI-51): add Alert error-chip primitive"
```

---

### Task 7: `SectionLabel` primitive

**Files:**
- Create: `components/ui/SectionLabel.tsx`
- Test: `tests/components/ui/SectionLabel.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/ui/SectionLabel.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionLabel } from "@/components/ui/SectionLabel";

describe("SectionLabel", () => {
  it("renders the eyebrow label class and text", () => {
    render(<SectionLabel>Details</SectionLabel>);
    const el = screen.getByText("Details");
    expect(el.className).toContain("hig-section-label");
  });
  it("merges custom className", () => {
    render(<SectionLabel className="mb-7">Details</SectionLabel>);
    expect(screen.getByText("Details").className).toContain("mb-7");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/ui/SectionLabel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `components/ui/SectionLabel.tsx`**

```tsx
import { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** Uppercase tracked eyebrow label (the `.hig-section-label` idiom). */
export function SectionLabel({ className = "", ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("hig-section-label", className)} {...rest} />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/ui/SectionLabel.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Checkpoint (user commits)**

```bash
git add components/ui/SectionLabel.tsx tests/components/ui/SectionLabel.test.tsx
git commit -m "feat(AI-51): add SectionLabel primitive"
```

---

### Task 8: TextField — `cn()` + error state

**Files:**
- Modify: `components/ui/TextField.tsx`
- Test: `tests/components/ui/TextField.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/ui/TextField.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TextField } from "@/components/ui/TextField";

describe("TextField", () => {
  it("renders label + input wired by id", () => {
    render(<TextField label="Title" />);
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
  });
  it("shows an error message and danger border when error is set", () => {
    render(<TextField label="Title" error="Required" />);
    const msg = screen.getByText("Required");
    expect(msg.className).toContain("text-danger");
    const input = screen.getByLabelText("Title");
    expect(input.className).toContain("border-danger");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/ui/TextField.test.tsx`
Expected: FAIL — `error` prop is not handled; no danger border / message.

- [ ] **Step 3: Update `components/ui/TextField.tsx`**

Replace the file with:
```tsx
"use client";

import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

type LabelProps = { label: string; description?: string; error?: string };

const fieldBase =
  "w-full rounded-md bg-surface border border-rule " +
  "text-hig-body text-ink placeholder:text-ink-tertiary " +
  "transition-all duration-150 ease-hig " +
  "focus:outline-none focus:border-accent focus:shadow-focus " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

const errorRing = "border-danger focus:border-danger";

export const TextField = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & LabelProps
>(function TextField({ label, description, error, className = "", id, ...rest }, ref) {
  const inputId = id ?? `tf-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <label htmlFor={inputId} className="flex flex-col gap-1.5">
      <span data-label className="text-hig-subhead font-medium text-ink">{label}</span>
      {description && (
        <span className="text-hig-footnote text-ink-secondary">{description}</span>
      )}
      <input
        ref={ref}
        id={inputId}
        data-input
        aria-invalid={error ? "true" : undefined}
        className={cn(fieldBase, "h-10 px-3", error && errorRing, className)}
        {...rest}
      />
      {error && <span className="text-hig-footnote text-danger">{error}</span>}
    </label>
  );
});

export const TextArea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & LabelProps
>(function TextArea({ label, description, error, className = "", id, ...rest }, ref) {
  const areaId = id ?? `ta-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <label htmlFor={areaId} className="flex flex-col gap-1.5">
      <span data-label className="text-hig-subhead font-medium text-ink">{label}</span>
      {description && (
        <span className="text-hig-footnote text-ink-secondary">{description}</span>
      )}
      <textarea
        ref={ref}
        id={areaId}
        data-input
        aria-invalid={error ? "true" : undefined}
        className={cn(fieldBase, "p-3 leading-relaxed resize-y", error && errorRing, className)}
        {...rest}
      />
      {error && <span className="text-hig-footnote text-danger">{error}</span>}
    </label>
  );
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/ui/TextField.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Regression**

Run: `npx vitest run tests/components/Editor.test.tsx tests/components/Editor.savedraft.test.tsx`
Expected: PASS (TextField/TextArea are consumed by the editor; the `error` prop is optional so behaviour is unchanged).

- [ ] **Step 6: Checkpoint (user commits)**

```bash
git add components/ui/TextField.tsx tests/components/ui/TextField.test.tsx
git commit -m "feat(AI-51): TextField/TextArea use cn + error state"
```

---

### Task 9: SegmentedControl — token radius/shadow + `cn()`

**Files:**
- Modify: `components/ui/SegmentedControl.tsx`
- Test: `tests/components/ui/SegmentedControl.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/ui/SegmentedControl.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

const ITEMS = [
  { value: "single", label: "Single" },
  { value: "epic", label: "Epic" },
] as const;

describe("SegmentedControl", () => {
  it("marks the active segment and uses shadow-card (no arbitrary shadow)", () => {
    render(<SegmentedControl value="single" items={ITEMS as any} onChange={() => {}} ariaLabel="Mode" />);
    const active = screen.getByRole("tab", { name: "Single" });
    expect(active).toHaveAttribute("aria-selected", "true");
    expect(active.className).toContain("shadow-card");
    expect(active.className).not.toContain("shadow-[");
    expect(active.className).not.toContain("rounded-[");
  });
  it("fires onChange when a segment is clicked", async () => {
    const onChange = vi.fn();
    render(<SegmentedControl value="single" items={ITEMS as any} onChange={onChange} ariaLabel="Mode" />);
    await userEvent.click(screen.getByRole("tab", { name: "Epic" }));
    expect(onChange).toHaveBeenCalledWith("epic");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/ui/SegmentedControl.test.tsx`
Expected: FAIL — active segment still uses `shadow-[0_1px_2px_rgba(0,0,0,0.10)]` and `rounded-[7px]`.

- [ ] **Step 3: Update `components/ui/SegmentedControl.tsx`**

Replace the inner `<button>` `className` expression (currently lines ~29-34) and the `cn` import. New file:
```tsx
"use client";

import { cn } from "@/lib/cn";

type Item<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  value: T;
  items: Item<T>[];
  onChange: (next: T) => void;
  ariaLabel?: string;
};

// HIG segmented control: pill container, inner "thumb" highlights the active
// segment with subtle elevation + softer fill. Keyboard-navigable via arrow keys.
export function SegmentedControl<T extends string>({ value, items, onChange, ariaLabel }: Props<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex p-0.5 rounded-md bg-surface-inset border border-rule gap-0.5"
    >
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.value)}
            className={cn(
              "px-3 h-7 rounded-sm text-hig-footnote font-medium transition-all duration-150 ease-hig",
              active ? "bg-surface text-ink shadow-card" : "text-ink-secondary hover:text-ink",
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/ui/SegmentedControl.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Regression**

Run: `npx vitest run tests/components/StandaloneApp.test.tsx`
Expected: PASS (the Single/Epic switch uses SegmentedControl).

- [ ] **Step 6: Checkpoint (user commits)**

```bash
git add components/ui/SegmentedControl.tsx tests/components/ui/SegmentedControl.test.tsx
git commit -m "feat(AI-51): SegmentedControl uses rounded-sm + shadow-card + cn"
```

---

# Phase 3 — Surface redesign (apply the language, keep it calm)

Surface restyles can't all be unit-asserted; the discipline for each is: **make the change → run that surface's existing tests → run `npm run check:tokens` and confirm the file is no longer listed → typecheck → manual light/dark eyeball.** Do not introduce new arbitrary values.

### Task 10: FlowGraphEditor — replace raw hex with tokens

**Files:**
- Modify: `components/FlowGraphEditor.tsx` (node fill/stroke at ~lines 85-86, 166-167, and the two further node renderers the audit flagged at ~353-354, 411-412)

- [ ] **Step 1: Replace the SVG polygon fill/stroke (DiamondNode, ~lines 83-88)**

Change:
```tsx
        <polygon
          points={`${DIAMOND_W / 2},0 ${DIAMOND_W},${DIAMOND_H / 2} ${DIAMOND_W / 2},${DIAMOND_H} 0,${DIAMOND_H / 2}`}
          fill="#fff"
          stroke="#cbd5e1"
          strokeWidth={1.5}
        />
```
to (token-driven via CSS variables — these resolve correctly in light **and** dark, removing the need for the globals.css dark `!important` override for these nodes):
```tsx
        <polygon
          points={`${DIAMOND_W / 2},0 ${DIAMOND_W},${DIAMOND_H / 2} ${DIAMOND_W / 2},${DIAMOND_H} 0,${DIAMOND_H / 2}`}
          fill="var(--color-surface)"
          stroke="var(--color-rule-strong)"
          strokeWidth={1.5}
        />
```

- [ ] **Step 2: Replace the default-node inline style (graphToRf, ~lines 162-170)**

Change:
```tsx
        : {
            padding: "8px 14px",
            background: "#fff",
            border: "1.5px solid #cbd5e1",
            fontSize: 13,
            ...SHAPE_STYLE[n.shape],
          },
```
to:
```tsx
        : {
            padding: "8px 14px",
            background: "var(--color-surface)",
            border: "1.5px solid var(--color-rule-strong)",
            fontSize: 13,
            ...SHAPE_STYLE[n.shape],
          },
```

- [ ] **Step 3: Find and fix the remaining two hex node renderers**

Run: `npm run check:tokens` and look for remaining `components/FlowGraphEditor.tsx` `raw-hex` lines (the audit reported renderers near lines 353-354 and 411-412). Apply the same substitution: `#fff` → `var(--color-surface)`, `#cbd5e1` → `var(--color-rule-strong)`.

- [ ] **Step 4: Verify the file is clean + tests pass**

Run:
```bash
npm run check:tokens
npx vitest run tests/components/epic/TaskGraph.test.tsx
npm run typecheck
```
Expected: no `components/FlowGraphEditor.tsx` lines in the scanner output; TaskGraph tests pass; typecheck clean.

- [ ] **Step 5: Manual check**

Run `npm run dev`, open a diagram with a decision/diamond node in light and dark mode; nodes render with surface fill + visible border in both.

- [ ] **Step 6: Checkpoint (user commits)**

```bash
git add components/FlowGraphEditor.tsx
git commit -m "fix(AI-51): tokenize FlowGraphEditor node colors (light+dark)"
```

---

### Task 11: App header — route links through `ButtonLink`, conform type

**Files:**
- Modify: `components/StandaloneApp.tsx` (header block ~line 1072; inline Drafts link ~lines 1080-1085)

- [ ] **Step 1: Import the primitive**

In `components/StandaloneApp.tsx`, add to the imports:
```tsx
import { ButtonLink } from "@/components/ui/Button";
```

- [ ] **Step 2: Replace the hand-rolled Drafts link**

Find the inline Drafts link (the `<Link href="/drafts" className="inline-flex items-center justify-center gap-1.5 rounded-md font-medium h-9 px-3.5 text-hig-subhead bg-surface-muted text-ink border border-rule hover:bg-surface-inset">…</Link>` around lines 1080-1085) and replace it with:
```tsx
<ButtonLink href="/drafts" variant="secondary">
  Drafts
</ButtonLink>
```
Keep the link's existing inner content (icon + "Drafts" label) inside `ButtonLink`. If a `next/link` import becomes unused after this, leave other usages intact (only remove the import if there are zero remaining `Link` usages in the file).

- [ ] **Step 3: Verify**

Run:
```bash
npx vitest run tests/components/StandaloneApp.test.tsx
npm run typecheck
npx playwright test e2e/drafts.spec.ts
```
Expected: StandaloneApp tests pass; typecheck clean; the drafts e2e still finds a `link` named "Drafts" with `href="/drafts"` (the `ButtonLink` renders an anchor, so `getByRole("link")` still matches).

- [ ] **Step 4: Checkpoint (user commits)**

```bash
git add components/StandaloneApp.tsx
git commit -m "refactor(AI-51): route header Drafts link through ButtonLink"
```

---

### Task 12: Error alerts/banners → `Alert` primitive

**Files:**
- Modify: `components/StandaloneApp.tsx` (ad-hoc error alerts ~lines 1219, 1284), `components/drafts/DraftsView.tsx` (error block lines 44-46)

- [ ] **Step 1: DraftsView — swap the error block**

In `components/drafts/DraftsView.tsx`, import:
```tsx
import { Alert } from "@/components/ui/Alert";
```
Replace (lines ~44-46):
```tsx
        <div className="rounded-md bg-danger/5 border border-danger/30 px-4 py-2.5 w-full" role="alert">
          <p className="text-hig-footnote text-danger">{state.message}</p>
        </div>
```
with:
```tsx
        <Alert className="w-full">{state.message}</Alert>
```

- [ ] **Step 2: StandaloneApp — swap ad-hoc error alerts**

In `components/StandaloneApp.tsx`, import `Alert` (alongside the `ButtonLink` import from Task 11). For each ad-hoc error block matching `bg-danger/5 border border-danger/30 … role="alert"` (the audit flagged ~lines 1219 and 1284), replace the wrapper `<div>` + inner `<p className="…text-danger">{msg}</p>` with `<Alert>{msg}</Alert>`, preserving any outer layout classes (margins/width) by passing them via `className`.

- [ ] **Step 3: Verify**

Run:
```bash
npx vitest run tests/components/drafts/DraftsView.test.tsx tests/components/StandaloneApp.test.tsx
npm run check:tokens
npm run typecheck
```
Expected: tests pass (error states still expose `role="alert"` with the message); no new violations; typecheck clean.

- [ ] **Step 4: Checkpoint (user commits)**

```bash
git add components/StandaloneApp.tsx components/drafts/DraftsView.tsx
git commit -m "refactor(AI-51): use Alert primitive for error states"
```

---

### Task 13: Editor form — glass surface + section labels

**Files:**
- Modify: `components/Editor.tsx` (form root ~line 244: `hig-card p-5 flex flex-col gap-4`)

- [ ] **Step 1: Adopt the strong-glass surface and SectionLabel**

In `components/Editor.tsx`:
- Import the primitives:
```tsx
import { Card } from "@/components/ui/Card";
import { SectionLabel } from "@/components/ui/SectionLabel";
```
- Change the form-root container from the `hig-card` div to `<Card tone="glass-strong" className="p-5 flex flex-col gap-4">…</Card>` (preserve all existing children and remaining classes).
- Replace any inline `<span className="hig-section-label …">` eyebrow usages in this file with `<SectionLabel>…</SectionLabel>` (preserving extra classes via `className`).

Keep the existing `text-hig-title3` section heading as-is (it already uses the ramp).

- [ ] **Step 2: Verify**

Run:
```bash
npx vitest run tests/components/Editor.test.tsx tests/components/Editor.savedraft.test.tsx
npm run check:tokens
npm run typecheck
```
Expected: editor tests pass (structure/labels unchanged in the accessibility tree); no new violations; typecheck clean.

- [ ] **Step 3: Manual check**

`npm run dev` → the editor card shows the calmer strong-glass treatment in light + dark; text stays legible over it.

- [ ] **Step 4: Checkpoint (user commits)**

```bash
git add components/Editor.tsx
git commit -m "feat(AI-51): editor adopts glass-strong Card + SectionLabel"
```

---

### Task 14: Drafts surfaces — dedupe button-links

**Files:**
- Modify: `components/drafts/DraftsView.tsx` (empty-state link lines 81-86), `components/drafts/DraftCard.tsx` (~line 106), `components/drafts/DraftsDashboard.tsx` (~line 75)

- [ ] **Step 1: DraftsView empty-state CTA → `ButtonLink`**

In `components/drafts/DraftsView.tsx`, import `ButtonLink` from `@/components/ui/Button`. Replace the empty-state link (lines 81-86):
```tsx
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-1.5 rounded-md font-medium h-9 px-3.5 text-hig-subhead bg-accent text-white hover:bg-accent-hover transition-colors"
        >
          Create a task
        </Link>
```
with:
```tsx
        <ButtonLink href="/" variant="primary">
          Create a task
        </ButtonLink>
```
Remove the now-unused `import Link from "next/link";` **only if** no other `Link` usage remains in the file.

- [ ] **Step 2: DraftCard + DraftsDashboard links → `ButtonLink`**

In `components/drafts/DraftCard.tsx` (~line 106) and `components/drafts/DraftsDashboard.tsx` (~line 75), replace each hand-rolled "link styled as button" (the `inline-flex items-center justify-center gap-1.5 rounded-md font-medium h-9 px-3.5 …` anchors) with `<ButtonLink href=… variant=…>…</ButtonLink>`, choosing `variant="secondary"` for the back/neutral links and `variant="primary"` for the primary CTA. Preserve hrefs and inner content.

- [ ] **Step 3: Verify**

Run:
```bash
npx vitest run tests/components/drafts
npm run check:tokens
npm run typecheck
npx playwright test e2e/drafts.spec.ts
```
Expected: drafts component tests pass; no new violations; typecheck clean; drafts e2e (`back to creator` link with `href="/"`, etc.) still passes.

- [ ] **Step 4: Checkpoint (user commits)**

```bash
git add components/drafts/DraftsView.tsx components/drafts/DraftCard.tsx components/drafts/DraftsDashboard.tsx
git commit -m "refactor(AI-51): dedupe drafts button-links via ButtonLink"
```

---

### Task 15: Long-tail conformance sweep (driven by `check:tokens`)

Clears every remaining violation: arbitrary `text-[Npx]` → the `hig-*` ramp, and the Jira-callback inline CSS.

**Files (from the Task 3 worklist):** `components/EditDiffView.tsx`, `components/MermaidDiagram.tsx`, `components/epic/bake/BakeNav.tsx`, `components/epic/EpicTaskCard.tsx`, `components/HelpPanel.tsx`, `components/AnalyzePanel.tsx`, `components/RunSheet.tsx`, `app/api/jira/callback/route.ts`, plus anything else the scanner lists.

- [ ] **Step 1: Generate the current worklist**

Run: `npm run check:tokens`
Expected: a list of remaining `arbitrary-text-size` and `raw-hex` lines.

- [ ] **Step 2: Map each `arbitrary-text-size` to the ramp**

For every flagged `text-[Npx]`, substitute the nearest ramp token (the ramp, from `tailwind.config.ts`): `10px`/`11px`/`12px` → `text-hig-caption`; `13px` → `text-hig-footnote`; `15px` → `text-hig-subhead`; `17px` → `text-hig-body`. If a flagged class also carried an arbitrary `leading-[…]`, leave the leading (line-heights are allowed) — only the `text-[…]` size changes. Example — `components/EditDiffView.tsx:80`:
```tsx
// before
className="text-[12px] leading-[1.45] …"
// after
className="text-hig-caption leading-[1.45] …"
```

- [ ] **Step 3: Jira OAuth callback page — reference token values**

In `app/api/jira/callback/route.ts` (server-rendered HTML string, ~lines 50-55), the inline `<style>` uses raw hex/px. This page can't use Tailwind classes, so define CSS variables at the top of the style block and reference them, mirroring the token values from `globals.css`:
```css
:root{--ink:#1d1d1f;--surface:#f5f5f7;--danger:#bf2828;--rule:#d2d2d7;}
```
Replace the raw usages with `var(--ink)` etc. Mark the `:root` declaration line with a trailing `/* design-tokens-allow: standalone OAuth popup mirrors globals.css tokens */` so the scanner accepts the single source-of-truth line.

- [ ] **Step 4: Brand/decorative exceptions**

Confirm the only intentional raw colours that remain are marked: in `components/signin/SigninExperience.tsx` add `// design-tokens-allow: brand mark` to the `fill="#ED3B3B"` line if the scanner flags it. (Aurora gradient stops live in `app/globals.css`, which the scanner does not scan.)

- [ ] **Step 5: Verify clean**

Run:
```bash
npm run check:tokens
npm run typecheck
npm test
```
Expected: `✓ No token violations.`; typecheck clean; full vitest suite passes (pre-existing failures, if any, unrelated to styling).

- [ ] **Step 6: Checkpoint (user commits)**

```bash
git add -A
git commit -m "refactor(AI-51): tokenize remaining text sizes + OAuth callback CSS"
```

---

# Phase 4 — Style guide, docs, enforcement

### Task 16: `/styleguide` living reference route

The route is intentionally **public** (no `requireSession`) — it renders no user data, only the design system. Middleware only adds CORS to `/api/*`, so no gating applies.

**Files:**
- Create: `app/styleguide/page.tsx`
- Test (e2e): `e2e/styleguide.spec.ts`

- [ ] **Step 1: Write the failing e2e smoke**

Create `e2e/styleguide.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

// The styleguide is a public design reference (no auth gate). It renders the
// token swatches + primitives in light and dark, so it doubles as the visual
// regression surface for the design system.
test.describe("styleguide route", () => {
  test("GET /styleguide renders the design-system reference", async ({ page }) => {
    await page.goto("/styleguide");
    await expect(page.getByRole("heading", { name: /design system/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /buttons/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /typography/i })).toBeVisible();
    // A live primitive renders (the primary button sample).
    await expect(page.getByRole("button", { name: /primary/i }).first()).toBeVisible();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test e2e/styleguide.spec.ts`
Expected: FAIL — `/styleguide` 404s (route doesn't exist).

- [ ] **Step 3: Implement `app/styleguide/page.tsx`**

```tsx
"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { TextField, TextArea } from "@/components/ui/TextField";
import { ThemeToggle } from "@/components/ThemeToggle";

const COLORS = [
  "bg-accent", "bg-accent-tint", "bg-danger", "bg-warning", "bg-success",
  "bg-surface", "bg-surface-muted", "bg-surface-subtle", "bg-surface-inset",
  "bg-ink", "bg-ink-secondary", "bg-ink-tertiary",
];
const TYPE = [
  "hig-caption", "hig-footnote", "hig-subhead", "hig-body", "hig-headline",
  "hig-title3", "hig-title2", "hig-title1", "hig-large",
];
const VARIANTS = ["primary", "secondary", "ghost", "danger", "success", "warning"] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-hig-title2">{title}</h2>
      {children}
    </section>
  );
}

export default function StyleguidePage() {
  return (
    <main className="min-h-screen bg-surface-subtle px-8 py-10">
      <div className="mx-auto flex max-w-4xl flex-col gap-12">
        <header className="flex items-center justify-between">
          <div>
            <SectionLabel>Reference</SectionLabel>
            <h1 className="text-hig-large text-ink">Design System</h1>
          </div>
          <ThemeToggle />
        </header>

        <Section title="Typography">
          <Card className="flex flex-col gap-2 p-6">
            {TYPE.map((t) => (
              <p key={t} className={`text-${t}`}>{t} — The quick brown fox</p>
            ))}
          </Card>
        </Section>

        <Section title="Colour tokens">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {COLORS.map((c) => (
              <div key={c} className="flex flex-col gap-1.5">
                <div className={`h-12 rounded-md border border-rule ${c}`} />
                <span className="text-hig-caption text-ink-secondary">{c}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Surfaces">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="p-5"><p className="text-hig-subhead">solid</p></Card>
            <Card tone="glass" className="p-5"><p className="text-hig-subhead">glass</p></Card>
            <Card tone="glass-strong" className="p-5"><p className="text-hig-subhead">glass-strong</p></Card>
          </div>
        </Section>

        <Section title="Buttons">
          <Card className="flex flex-wrap gap-3 p-6">
            {VARIANTS.map((v) => (
              <Button key={v} variant={v}>{v}</Button>
            ))}
          </Card>
        </Section>

        <Section title="Form inputs">
          <Card className="flex flex-col gap-4 p-6">
            <TextField label="Title" placeholder="Add a payments dashboard" />
            <TextField label="Title (error)" error="Title is required" />
            <TextArea label="Description" placeholder="Describe the change…" />
          </Card>
        </Section>

        <Section title="Error states">
          <div className="flex flex-col gap-3">
            <Alert>Something went wrong while saving.</Alert>
            <Alert tone="warning">This draft has unsaved changes.</Alert>
            <Alert tone="success">Exported to Jira.</Alert>
            <Alert tone="accent">Auto-saved a moment ago.</Alert>
          </div>
        </Section>
      </div>
    </main>
  );
}
```
> Note: the `text-${t}` / `bg-${c}` template classes are safe because every literal value is already used elsewhere in the app, so Tailwind's content scanner keeps them in the build. If any swatch renders unstyled, list the class literally instead.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test e2e/styleguide.spec.ts`
Expected: PASS.

- [ ] **Step 5: Manual check**

`npm run dev` → open `/styleguide`, toggle the theme: every swatch, type specimen, surface, button, input (incl. error) and alert renders correctly in light **and** dark.

- [ ] **Step 6: Checkpoint (user commits)**

```bash
git add app/styleguide/page.tsx e2e/styleguide.spec.ts
git commit -m "feat(AI-51): add /styleguide living design reference"
```

---

### Task 17: Author the design pattern guide

**Files:**
- Create: `docs/design-system.md`

- [ ] **Step 1: Write `docs/design-system.md`**

Author the guide with these sections (use real token values from `tailwind.config.ts` + `app/globals.css`, and `file:line` references where helpful):

1. **Overview & principles** — the system is HIG-based; the sign-in page (`components/signin/SigninExperience.tsx`) is the canonical exemplar; every value is a named token/utility; it must hold in light **and** dark.
2. **Token naming conventions** — semantic, not literal (`accent`/`ink`/`surface`/`rule` + state suffixes `-hover`/`-pressed`/`-tint`; surfaces `muted`/`subtle`/`inset`; ink `secondary`/`tertiary`/`quaternary`). Where tokens live: `:root` + `html.dark` in `globals.css` define values; `tailwind.config.ts` maps them to utilities.
3. **Typography** — the `hig-*` ramp table (token → px/line-height/weight), with a copy-paste example, and the rule: never `text-[Npx]`.
4. **Colour tokens** — table of each colour token + light/dark value; "no raw hex" rule; the documented brand/decorative exceptions.
5. **Spacing scale** — use Tailwind's default scale utilities (`p-*`, `gap-*`, `space-*`); fixed layout dimensions via `w-[…]`/`min-h-[…]` are acceptable, arbitrary spacing/colour/type are not.
6. **Form inputs** — `TextField` / `TextArea` usage incl. the `error` prop; focus ring via `focus:shadow-focus`.
7. **Buttons** — `Button` variants/sizes + `ButtonLink` for links; never hand-roll button className strings.
8. **Surfaces** — `Card` tones (`solid` / `glass` / `glass-strong`) and when to use each (calm surfaces guidance).
9. **Error states** — `Alert` tones.
10. **Motion** — `lib/motion.ts` vocabulary (`fadeUp`, `scaleIn`, `SPRING`, `EASE_HIG`) + the `transition-all duration-150 ease-hig` micro-state idiom; `reducedMotion="user"` is global.
11. **Skill set / Getting started** — tools (Tailwind v3, the token layer, `cn()`, motion vocab, the `/styleguide` route); rules (no raw hex / no arbitrary colour-or-type values — enforced by `npm run check:tokens`); step-by-step: (a) add a token (edit `:root` + `html.dark`, map in `tailwind.config.ts`), (b) build a conformant component (compose primitives + `cn()`), (c) preview it on `/styleguide`, (d) run `npm run check:tokens` before opening a PR.
12. **Living reference** — link to `/styleguide`.

- [ ] **Step 2: Verify links/build**

Run: `npm run build`
Expected: build succeeds (doc is Markdown; this just confirms nothing else broke). Manually skim the doc for any "TBD"/placeholder — there must be none.

- [ ] **Step 3: Checkpoint (user commits)**

```bash
git add docs/design-system.md
git commit -m "docs(AI-51): add design pattern guide"
```

---

### Task 18: README link + CHANGELOG

**Files:**
- Modify: `README.md`
- Create: `CHANGELOG.md`

- [ ] **Step 1: Add a README "Design system" section**

In `README.md`, after the `## Architecture at a glance` section, add:
```markdown
## Design system

The UI follows a shared, HIG-based token system (colours, type ramp, spacing,
shadows) defined in `tailwind.config.ts` + `app/globals.css`. See the design
pattern guide at **[`docs/design-system.md`](docs/design-system.md)** for tokens,
conventions, and a getting-started section, and the live reference at
**`/styleguide`** (run `npm run dev`, open `/styleguide`). Run `npm run check:tokens`
to verify no raw hex or arbitrary values have crept in.
```
Also add a row to the existing "Where things live" table:
```markdown
| Understand or extend the design system | `docs/design-system.md` + `/styleguide` |
```

- [ ] **Step 2: Create `CHANGELOG.md`**

```markdown
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
```

- [ ] **Step 3: Verify**

Run: `npm run check:tokens`
Expected: `✓ No token violations.` (Markdown files aren't scanned, but this confirms the tree is still clean.)

- [ ] **Step 4: Checkpoint (user commits)**

```bash
git add README.md CHANGELOG.md
git commit -m "docs(AI-51): link design guide from README, add CHANGELOG"
```

---

### Task 19: Wire `check:tokens` as a gate + full verification

**Files:**
- Modify: `package.json` (scripts)

- [ ] **Step 1: Add the token check to the lint step**

In `package.json` `scripts`, change:
```json
    "lint": "eslint . --ext .ts,.tsx",
```
to:
```json
    "lint": "eslint . --ext .ts,.tsx && npm run check:tokens",
```

- [ ] **Step 2: Full verification sweep**

Run, in order:
```bash
npm run typecheck
npm run lint
npm test
npm run build
npx playwright test e2e/styleguide.spec.ts e2e/drafts.spec.ts
```
Expected:
- `typecheck` — clean.
- `lint` — eslint clean **and** `✓ No token violations.`
- `test` — vitest green (pre-existing unrelated failures, if any, documented as known).
- `build` — succeeds.
- e2e styleguide + drafts specs pass. (`finalize.spec.ts` / `export-metadata.spec.ts` have pre-existing failures unrelated to this work — do not treat as regressions; confirm by comparing against a pre-change run if unsure.)

- [ ] **Step 3: Final manual review**

`npm run dev` → side-by-side `/signin`, `/`, `/drafts`, `/styleguide` in both light and dark. Confirm the task creator now speaks the same visual language as the sign-in page, dense panels stay legible, and nothing regressed.

- [ ] **Step 4: Checkpoint (user commits)**

```bash
git add package.json
git commit -m "chore(AI-51): enforce token conformance in lint"
```

---

## Self-review — spec coverage

Mapping AI-51's six ticket task-groups to plan tasks:

1. **Design audit & token definition** → done in the spec's audit + Task 2 (glass tokens) + Task 3 (scanner codifies what counts as a violation). Naming conventions → Task 17 §2.
2. **Task creator UI alignment** (raw values → tokens; inputs/buttons/error states; typography; contrast/focus/light-dark) → Tasks 4-15 (primitives + surface redesign + FlowGraphEditor + long-tail sweep); light/dark verified per task + Task 19 §3.
3. **Design pattern guide authoring** (per-area sections, examples, skill-set/getting-started, published) → Task 17 (guide) + Task 16 (`/styleguide` as the "design tooling" publish target).
4. **Regression check** (other screens; token consistency) → Task 19 §2 (`build`, full `test`, e2e) + `check:tokens` covering all of `app`/`components`/`lib`.
5. **Testing** (visual review; scan for raw hex/magic numbers; all platforms) → Task 19 §3 (visual), `check:tokens` (scan), light/dark × standalone/embed (Chromium e2e).
6. **Documentation** (link guide from README; changelog entry) → Task 18.

No spec requirement is left without a task. No placeholders remain. Primitive names are consistent across tasks (`Button`/`ButtonLink`, `Card` with `tone`, `Alert` with `tone`, `SectionLabel`, `TextField` `error`, `cn`, `buttonClasses`, `findViolations`).
```