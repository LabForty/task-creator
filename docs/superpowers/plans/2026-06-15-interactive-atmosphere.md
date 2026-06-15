# Interactive Atmosphere Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add elegant, login-grade interactivity to the app's empty spaces — cursor spotlights, a reactive aurora, typewriter idea-prompts, a self-drawing ghost diagram, a restrained success flourish, plus tasteful delight/functional touches — all reduced-motion safe.

**Architecture:** Foundation-first (mirrors the design-polish branch): a small set of reusable interaction primitives (hooks + components + CSS), then per-surface application, in four phases. Everything reuses existing primitives and extends sign-in's craft rather than duplicating it.

**Tech Stack:** Next.js 16 · React 19 · Tailwind 3.4 (CSS-variable tokens, class dark mode) · `motion` v12 (Framer) · Vitest 4 + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-06-15-interactive-atmosphere-design.md`.

---

## Design principles (NON-NEGOTIABLE — apply to every task)

1. **Reuse, don't duplicate.** Use the existing `Card`, `Button`, `Alert`, `SectionLabel` primitives; the motion vocabulary in `lib/motion.ts` (`SPRING`, `EASE_HIG`, `DUR_FAST`, `fadeUp`, `scaleIn`, `celebrate`, `crossFade`); `AmbientBackground`; `BrandMark`; `cn()`. When a behaviour exists in `components/signin/SigninExperience.tsx` (spotlight, typewriter), **extract it into a shared primitive and make sign-in consume the primitive** — never copy-paste.
2. **Tokens only.** No raw hex in `.ts/.tsx` (the `check:tokens` scanner enforces this on `app/`, `components/`, `lib/`). Decorative rgba glows live in `app/globals.css` (not scanned), mirroring `.signin-card`/`.ambient-*`.
3. **Reduced-motion safe.** Every animation defers to `prefers-reduced-motion` (global rule in `globals.css` + `MotionConfig reducedMotion="user"` in `components/MotionRoot.tsx`). Hooks that animate must no-op under reduced motion.
4. **Performance.** Pointer handlers are `{ passive: true }` and rAF-throttled. No continuous app-wide animation loops; nothing animates on a hot path.
5. **Calm/elegant.** Low-opacity glows, ≤6px magnetic pull, soft single-shot flourishes — alive but never distracting. Dense content surfaces stay `glass-strong`/legible.
6. **Follow established patterns.** New `components/ui/*` primitives mirror the structure of `Skeleton.tsx`/`Card.tsx` (props via `HTMLAttributes`, `cn()` merge). Tests mirror `tests/components/ui/*`.

## Conventions & ground rules

- **Commit policy:** per the user's git rules, do NOT auto-commit. Commit per phase, only with the user's go-ahead. The `Commit` steps mark phase boundaries; pause for the user. End commit messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Per-task verification:** `npm run typecheck`, `npm run lint` (incl. `check:tokens`), `npm test` (`vitest run`); surface tasks also `npm run build`. Visual/interaction feel is the **user's** acceptance gate (Claude can't run a browser) — never claim visual verification.
- **jsdom note:** `tests/setup.ts` sets `MotionGlobalConfig.skipAnimations = true` (AnimatePresence resolves to final state) and polyfills storage. It does NOT polyfill `window.matchMedia` — Task 1 adds a stub so reduced-motion guards don't throw in tests.
- **Single source of `now`:** render bodies must not call `Date.now()` (lint error); use lazy `useState(() => Date.now())` or pass a prop, per `DraftCard.tsx`.

## File structure map

| File | New/Modify | Responsibility |
| --- | --- | --- |
| `tests/setup.ts` | Modify | Add a `window.matchMedia` stub (reduced-motion guards) |
| `lib/interaction/useSpotlight.ts` | **New** | Cursor-tracking glow hook (sets `--spot-x/y`) |
| `lib/interaction/useMagneticHover.ts` | **New** | Gentle ≤6px pull-toward-cursor hook |
| `components/ui/Typewriter.tsx` | **New** | Rotating type/delete headline (extracted from sign-in) |
| `components/ui/GhostDiagram.tsx` | **New** | Self-drawing wireframe SVG placeholder |
| `components/ui/SuccessFlourish.tsx` | **New** | One-shot soft ring + sparks on success |
| `lib/draft/readiness.ts` | **New** | `readinessScore(draft): 0..3` completeness heuristic |
| `app/globals.css` | Modify | `.spotlight`, `.ghost-diagram`, `.success-flourish`, `.icon-hover-*`, `.ambient-bg[data-tone]`, `.brandmark-bloom` CSS |
| `components/AmbientBackground.tsx` | Modify | `tone?: "idle"\|"running"\|"success"` prop → `data-tone` |
| `components/signin/SigninExperience.tsx` | Modify | Consume `Typewriter` + `useSpotlight` (drop local copies) |
| `components/StandaloneApp.tsx`, `components/EmbedApp.tsx` | Modify | Spotlight cards, magnetic CTAs, aurora `tone` from state, success flourish |
| `components/Editor.tsx` | Modify | Typewriter idea-prompts + prefill; readiness hint; shortcut hints; spotlight |
| `components/Preview.tsx`, `components/DiagramView.tsx` | Modify | GhostDiagram empty state; diagram-type hover preview; magnetic export CTA |
| `components/drafts/DraftCard.tsx` | Modify | Spotlight; hover-peek |
| `components/BrandMark.tsx` | Modify | Click easter-egg bloom |
| `components/JiraExport.tsx`, `components/RunSheet.tsx` | Modify | SuccessFlourish on export/finalize success |
| `app/styleguide/page.tsx`, `docs/design-system.md`, `CHANGELOG.md` | Modify | Document the primitives |
| `tests/lib/interaction/*`, `tests/components/ui/*`, `tests/lib/draft/readiness.test.ts` | **New** | Unit coverage |

---

# Phase 1 — Foundation primitives

## Task 1: `window.matchMedia` test stub

**Files:** Modify `tests/setup.ts`

- [ ] **Step 1: Add the stub** (append, after the storage polyfill, before `MotionGlobalConfig.skipAnimations`):

```ts
// jsdom doesn't implement matchMedia; reduced-motion guards call it. Stub it to
// "no preference" so hooks run their normal (animated) path in tests.
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
```

- [ ] **Step 2: Verify** — `npm test` → expect still green (no behaviour change yet). Commit deferred to phase end.

## Task 2: `useSpotlight` hook + `.spotlight` CSS

**Files:** Create `lib/interaction/useSpotlight.ts`; Modify `app/globals.css`; Test `tests/lib/interaction/useSpotlight.test.tsx`

**Reuse:** generalizes the sign-in card spotlight (`SigninExperience.tsx` mousemove effect + `.signin-card::before` in `globals.css`). Sign-in is migrated to consume this in Task 9.

- [ ] **Step 1: Write the failing test** — `tests/lib/interaction/useSpotlight.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { useSpotlight } from "@/lib/interaction/useSpotlight";

function Probe() {
  const ref = useSpotlight<HTMLDivElement>();
  return <div ref={ref} data-testid="surf" className="spotlight" />;
}

describe("useSpotlight", () => {
  it("sets --spot-x/--spot-y on pointer movement", async () => {
    const { getByTestId } = render(<Probe />);
    const el = getByTestId("surf");
    fireEvent.pointerMove(el, { clientX: 10, clientY: 10 });
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(el.style.getPropertyValue("--spot-x")).not.toBe("");
    expect(el.style.getPropertyValue("--spot-y")).not.toBe("");
  });
});
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run tests/lib/interaction/useSpotlight.test.tsx` (module missing).

- [ ] **Step 3: Implement** `lib/interaction/useSpotlight.ts`:

```ts
"use client";
import { useEffect, useRef } from "react";

/**
 * Cursor-tracking accent glow for a surface. Attach the returned ref to the
 * element and give it the `.spotlight` class (globals.css): on pointer movement
 * it sets `--spot-x`/`--spot-y` (percent) which the `.spotlight::before` radial
 * follows. rAF-throttled, passive listener. Reduced-motion: no tracking (glow
 * stays centered). Generalizes the sign-in card spotlight.
 */
export function useSpotlight<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mq = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
    if (mq?.matches) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const rect = el.getBoundingClientRect();
        const w = rect.width || 1;
        const h = rect.height || 1;
        el.style.setProperty("--spot-x", `${((e.clientX - rect.left) / w) * 100}%`);
        el.style.setProperty("--spot-y", `${((e.clientY - rect.top) / h) * 100}%`);
      });
    };
    el.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      el.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return ref;
}
```

- [ ] **Step 4: Add `.spotlight` CSS** — append to `app/globals.css` (mirrors `.signin-card::before`, lower opacity for dense surfaces):

```css
/* ───────────────────────── Cursor spotlight (shared) ─────────────────────────
   Pair with the useSpotlight hook. A faint accent glow follows the cursor; only
   visible on hover. Reduced-motion: the hook doesn't track, so the glow stays
   centered and the hover-fade still applies. */
.spotlight { position: relative; isolation: isolate; --spot-x: 50%; --spot-y: 0%; }
.spotlight::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(240px 240px at var(--spot-x) var(--spot-y), rgba(0, 122, 255, 0.10), transparent 70%);
  opacity: 0;
  transition: opacity 200ms ease;
  pointer-events: none;
  z-index: -1;
}
.spotlight:hover::before { opacity: 1; }
html.dark .spotlight::before {
  background: radial-gradient(280px 280px at var(--spot-x) var(--spot-y), rgba(10, 132, 255, 0.16), transparent 70%);
}
```

- [ ] **Step 5: Run → PASS**; then `npm run lint` (token scanner clean — rgba lives in `.css`).

## Task 3: `useMagneticHover` hook

**Files:** Create `lib/interaction/useMagneticHover.ts`; Test `tests/lib/interaction/useMagneticHover.test.tsx`

- [ ] **Step 1: Failing test** — `tests/lib/interaction/useMagneticHover.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { useMagneticHover } from "@/lib/interaction/useMagneticHover";

function Probe() {
  const ref = useMagneticHover<HTMLButtonElement>();
  return <button ref={ref} data-testid="btn">Go</button>;
}

describe("useMagneticHover", () => {
  it("applies a bounded transform on move and resets on leave", async () => {
    const { getByTestId } = render(<Probe />);
    const el = getByTestId("btn");
    fireEvent.pointerMove(el, { clientX: 1000, clientY: 1000 });
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(el.style.transform).toContain("translate");
    fireEvent.pointerLeave(el);
    expect(el.style.transform === "" || el.style.transform.includes("0")).toBe(true);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** `lib/interaction/useMagneticHover.ts`:

```ts
"use client";
import { useEffect, useRef } from "react";

const MAX = 6; // px — barely-there pull, per the "elegant & subtle" tone

/**
 * Gentle magnetic hover for a small interactive element (e.g. a prominent CTA).
 * While the pointer is over it, the element translates toward the cursor by a
 * damped amount capped at MAX px; eases back to 0 on leave. rAF-throttled,
 * passive. Reduced-motion: no-op.
 */
export function useMagneticHover<T extends HTMLElement = HTMLButtonElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mq = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
    if (mq?.matches) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const rect = el.getBoundingClientRect();
        const dx = e.clientX - (rect.left + rect.width / 2);
        const dy = e.clientY - (rect.top + rect.height / 2);
        const clamp = (v: number) => Math.max(-MAX, Math.min(MAX, v * 0.3));
        el.style.transform = `translate(${clamp(dx)}px, ${clamp(dy)}px)`;
      });
    };
    const onLeave = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      el.style.transform = "translate(0px, 0px)";
    };
    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return ref;
}
```

- [ ] **Step 4: Run → PASS.** (Note: the element should carry a `transition-transform` utility so the reset eases; applied at call sites.)

## Task 4: `Typewriter` component (extract from sign-in)

**Files:** Create `components/ui/Typewriter.tsx`; Test `tests/components/ui/Typewriter.test.tsx`

**Reuse:** extracts the rotating-headline state machine from `SigninExperience.tsx` (the `typed`/`phase`/`phraseIdx` effect). Sign-in migrates to it in Task 9.

- [ ] **Step 1: Failing test** — `tests/components/ui/Typewriter.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Typewriter } from "@/components/ui/Typewriter";

describe("Typewriter", () => {
  it("renders text from the phrase list with a live region", () => {
    render(<Typewriter phrases={["Turn ideas into stories."]} />);
    // Under jsdom the timers haven't advanced; the live region exists and the
    // widest phrase reserves layout. At minimum the component renders an
    // aria-live region without crashing.
    expect(screen.getByRole("status", { hidden: true })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** `components/ui/Typewriter.tsx` (state machine lifted from sign-in; reduced-motion shows the first phrase statically):

```tsx
"use client";
import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  phrases: string[];
  /** Optional click handler — receives the phrase currently displayed. */
  onPick?: (phrase: string) => void;
  className?: string;
};

/**
 * Rotating type → hold → delete → next headline. Extracted from the sign-in
 * experience. Reduced-motion: renders the first phrase statically (no typing).
 * If onPick is set the rendered phrase is a button (used for the editor's
 * clickable idea-prompts).
 */
export function Typewriter({ phrases, onPick, className = "" }: Props) {
  const reduced = useRef(
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  );
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [typed, setTyped] = useState(reduced.current ? phrases[0] ?? "" : "");
  const [phase, setPhase] = useState<"typing" | "holding" | "deleting">("typing");

  useEffect(() => {
    if (reduced.current) return;
    const phrase = phrases[phraseIdx] ?? "";
    let t: ReturnType<typeof setTimeout>;
    if (phase === "typing") {
      if (typed.length < phrase.length) t = setTimeout(() => setTyped(phrase.slice(0, typed.length + 1)), 38);
      else t = setTimeout(() => setPhase("holding"), 1400);
    } else if (phase === "holding") {
      t = setTimeout(() => setPhase("deleting"), 0);
    } else {
      if (typed.length > 0) t = setTimeout(() => setTyped(phrase.slice(0, typed.length - 1)), 22);
      else t = setTimeout(() => { setPhase("typing"); setPhraseIdx((i) => (i + 1) % phrases.length); }, 220);
    }
    return () => clearTimeout(t);
  }, [typed, phase, phraseIdx, phrases]);

  const widest = useMemo(() => phrases.reduce((a, b) => (b.length > a.length ? b : a), ""), [phrases]);
  const current = phrases[phraseIdx] ?? "";

  const body = (
    <span className="relative inline-block">
      <span aria-hidden className="pointer-events-none invisible whitespace-pre-wrap">{widest}</span>
      <span role="status" aria-live="polite" className="absolute inset-0 whitespace-pre-wrap">
        {typed}
        {!reduced.current && <span className="signin-caret" aria-hidden>|</span>}
      </span>
    </span>
  );

  if (onPick) {
    return (
      <button type="button" onClick={() => onPick(current)} className={className}>
        {body}
      </button>
    );
  }
  return <span className={className}>{body}</span>;
}
```

(Reuses the existing `.signin-caret` CSS in `globals.css` for the blink.)

- [ ] **Step 4: Run → PASS.**

## Task 5: `GhostDiagram` component + CSS

**Files:** Create `components/ui/GhostDiagram.tsx`; Modify `app/globals.css`; Test `tests/components/ui/GhostDiagram.test.tsx`

- [ ] **Step 1: Failing test**:

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { GhostDiagram } from "@/components/ui/GhostDiagram";

describe("GhostDiagram", () => {
  it("renders a decorative aria-hidden svg", () => {
    const { container } = render(<GhostDiagram />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("aria-hidden")).toBe("true");
    expect(container.firstElementChild!.className).toContain("ghost-diagram");
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** `components/ui/GhostDiagram.tsx` (faint wireframe: 3 nodes + connecting edges; strokes use `currentColor` so it inherits a muted ink colour from the parent):

```tsx
import { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Decorative, aria-hidden wireframe that self-draws on a loop (globals.css
 * `.ghost-diagram`). A placeholder hinting at the diagrams "Create diagrams"
 * will produce. Reduced-motion: renders the completed static wireframe.
 */
export function GhostDiagram({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div aria-hidden className={cn("ghost-diagram text-ink-quaternary", className)} {...rest}>
      <svg viewBox="0 0 200 120" width="100%" height="100%" fill="none" aria-hidden>
        <g stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
          <rect className="gd-stroke" x="14" y="20" width="52" height="28" rx="6" />
          <rect className="gd-stroke" x="134" y="20" width="52" height="28" rx="6" />
          <rect className="gd-stroke" x="74" y="74" width="52" height="28" rx="6" />
          <path className="gd-stroke" d="M66 34 H100 V74" />
          <path className="gd-stroke" d="M134 34 H100" />
        </g>
      </svg>
    </div>
  );
}
```

- [ ] **Step 4: Add `.ghost-diagram` CSS** — append to `app/globals.css`:

```css
/* ───────────────────────── Ghost diagram (empty-state hint) ─────────────────
   A wireframe that draws itself on a loop via stroke-dashoffset. Decorative.
   Reduced-motion: the global rule zeroes the animation, leaving the completed
   (fully-drawn) wireframe. */
.ghost-diagram { opacity: 0.5; }
.ghost-diagram .gd-stroke {
  stroke-dasharray: 240;
  stroke-dashoffset: 240;
  animation: gd-draw 4s ease-in-out infinite;
}
.ghost-diagram .gd-stroke:nth-child(2) { animation-delay: 0.3s; }
.ghost-diagram .gd-stroke:nth-child(3) { animation-delay: 0.6s; }
.ghost-diagram .gd-stroke:nth-child(4) { animation-delay: 0.9s; }
.ghost-diagram .gd-stroke:nth-child(5) { animation-delay: 1.1s; }
@keyframes gd-draw {
  0%   { stroke-dashoffset: 240; }
  45%  { stroke-dashoffset: 0; }
  85%  { stroke-dashoffset: 0; }
  100% { stroke-dashoffset: 240; }
}
@media (prefers-reduced-motion: reduce) {
  .ghost-diagram .gd-stroke { stroke-dashoffset: 0; animation: none; }
}
```

- [ ] **Step 5: Run → PASS**; `npm run lint`.

## Task 6: `SuccessFlourish` component + CSS

**Files:** Create `components/ui/SuccessFlourish.tsx`; Modify `app/globals.css`; Test `tests/components/ui/SuccessFlourish.test.tsx`

- [ ] **Step 1: Failing test**:

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SuccessFlourish } from "@/components/ui/SuccessFlourish";

describe("SuccessFlourish", () => {
  it("renders a decorative aria-hidden flourish layer", () => {
    const { container } = render(<SuccessFlourish />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute("aria-hidden")).toBe("true");
    expect(root.className).toContain("success-flourish");
    expect(root.className).toContain("pointer-events-none");
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** `components/ui/SuccessFlourish.tsx` (a soft expanding ring + a few sparks; one-shot on mount; absolutely positioned, decorative):

```tsx
import { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * One-shot success flourish — a soft expanding accent ring + a few sparks, ~600ms.
 * Mount it (e.g. keyed on the success event) over a success surface. Decorative,
 * aria-hidden, non-interactive. Reduced-motion: the global rule neutralizes the
 * animations (no burst); pair with the `celebrate` motion beat on the content.
 */
export function SuccessFlourish({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn("success-flourish pointer-events-none absolute inset-0 overflow-visible", className)}
      {...rest}
    >
      <span className="sf-ring" />
      <span className="sf-spark sf-spark--1" />
      <span className="sf-spark sf-spark--2" />
      <span className="sf-spark sf-spark--3" />
    </div>
  );
}
```

- [ ] **Step 4: Add `.success-flourish` CSS** — append to `app/globals.css`:

```css
/* ───────────────────────── Success flourish (restrained) ────────────────────
   A soft accent ring expands once + three sparks drift out. One-shot (~600ms).
   NOT confetti. Reduced-motion: animations disabled (the content's celebrate
   beat carries the moment). */
.success-flourish { display: block; }
.success-flourish .sf-ring {
  position: absolute; left: 50%; top: 50%; width: 12px; height: 12px;
  margin: -6px 0 0 -6px; border-radius: 9999px;
  border: 2px solid var(--color-accent);
  transform: scale(0.4); opacity: 0.7;
  animation: sf-ring 600ms ease-out forwards;
}
.success-flourish .sf-spark {
  position: absolute; left: 50%; top: 50%; width: 4px; height: 4px;
  margin: -2px 0 0 -2px; border-radius: 9999px; background: var(--color-success);
  opacity: 0; animation: sf-spark 600ms ease-out forwards;
}
.success-flourish .sf-spark--1 { --sf-dx: 26px; --sf-dy: -20px; }
.success-flourish .sf-spark--2 { --sf-dx: -22px; --sf-dy: -14px; animation-delay: 60ms; }
.success-flourish .sf-spark--3 { --sf-dx: 8px; --sf-dy: -30px; animation-delay: 30ms; }
@keyframes sf-ring {
  to { transform: scale(2.6); opacity: 0; }
}
@keyframes sf-spark {
  20% { opacity: 1; }
  to { transform: translate(var(--sf-dx), var(--sf-dy)); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .success-flourish .sf-ring, .success-flourish .sf-spark { animation: none; opacity: 0; }
}
```

- [ ] **Step 5: Run → PASS**; `npm run lint`.

## Task 7: `AmbientBackground` `tone` prop + CSS

**Files:** Modify `components/AmbientBackground.tsx`, `app/globals.css`; Test extend `tests/components/AmbientBackground.test.tsx`

**Reuse:** extends the existing `AmbientBackground` (do not create a new component).

- [ ] **Step 1: Failing test** — add to `tests/components/AmbientBackground.test.tsx`:

```tsx
it("reflects the tone prop as data-tone", () => {
  const { container } = render(<AmbientBackground tone="running" />);
  expect((container.firstElementChild as HTMLElement).getAttribute("data-tone")).toBe("running");
});
it("defaults to idle tone", () => {
  const { container } = render(<AmbientBackground />);
  expect((container.firstElementChild as HTMLElement).getAttribute("data-tone")).toBe("idle");
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** — change `components/AmbientBackground.tsx` signature + root:

```tsx
export function AmbientBackground({ tone = "idle" }: { tone?: "idle" | "running" | "success" } = {}) {
  return (
    <div
      aria-hidden
      data-tone={tone}
      className="ambient-bg pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      {/* existing blobs + grid + vignette unchanged */}
      <span className="ambient-blob ambient-blob--a" />
      <span className="ambient-blob ambient-blob--b" />
      <span className="ambient-blob ambient-blob--c" />
      <div className="ambient-grid absolute inset-0" />
      <div className="ambient-vignette absolute inset-0" />
    </div>
  );
}
```

- [ ] **Step 4: Add tone CSS** — in `app/globals.css`, after the `.ambient-*` block, add tinted transitions (the blob accent intensifies while running; a brief success-green wash):

```css
.ambient-bg { transition: filter 500ms ease; }
.ambient-bg[data-tone="running"] { filter: saturate(1.15) brightness(1.05); }
.ambient-bg[data-tone="success"]::after {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(120% 80% at 50% -10%, var(--color-success-tint) 0%, transparent 55%);
  animation: ambient-success 1600ms ease-out forwards;
}
@keyframes ambient-success { 0% { opacity: 0.8; } 100% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .ambient-bg { transition: none; }
  .ambient-bg[data-tone="success"]::after { animation: none; opacity: 0; }
}
```

- [ ] **Step 5: Run → PASS**; `npm run lint`.

## Task 8: `readinessScore` helper

**Files:** Create `lib/draft/readiness.ts`; Test `tests/lib/draft/readiness.test.ts`

**Reuse:** import the `Draft` type from `lib/draft/autosave.ts`; mirror the field handling of `isBlankDraft`/`isDirty`.

- [ ] **Step 1: Failing test** — `tests/lib/draft/readiness.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { EMPTY_DRAFT } from "@/lib/draft/autosave";
import { readinessScore } from "@/lib/draft/readiness";

describe("readinessScore", () => {
  it("is 0 for an empty draft", () => {
    expect(readinessScore(EMPTY_DRAFT)).toBe(0);
  });
  it("counts title, sufficient description, and >=1 acceptance criterion", () => {
    const d = {
      ...EMPTY_DRAFT,
      title: "Export users",
      description: "x".repeat(40),
      acceptanceCriteria: ["Given a user list, a CSV downloads"],
    };
    expect(readinessScore(d)).toBe(3);
  });
  it("ignores whitespace-only fields", () => {
    expect(readinessScore({ ...EMPTY_DRAFT, title: "   " })).toBe(0);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** `lib/draft/readiness.ts` (confirm `Draft` field names in `autosave.ts`: `title: string`, `description: string`, `acceptanceCriteria: string[]`):

```ts
import type { Draft } from "@/lib/draft/autosave";

const MIN_DESCRIPTION = 40; // visible chars

/**
 * Client-side completeness score 0..3 for the editor's readiness hint:
 * (1) title present, (2) description >= MIN_DESCRIPTION visible chars,
 * (3) >= 1 non-empty acceptance criterion. No AI, no network.
 */
export function readinessScore(d: Draft): number {
  let n = 0;
  if (d.title.trim()) n += 1;
  if (d.description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().length >= MIN_DESCRIPTION) n += 1;
  if ((d.acceptanceCriteria ?? []).some((a) => a.trim())) n += 1;
  return n;
}

export const READINESS_MAX = 3;
```

- [ ] **Step 4: Run → PASS.**

## Task 9: Migrate sign-in to the shared primitives + icon-hover CSS

**Files:** Modify `components/signin/SigninExperience.tsx`, `app/globals.css`

**Reuse / DRY:** sign-in must consume `Typewriter` + `useSpotlight` instead of its local copies (no visual change), proving the extraction.

- [ ] **Step 1:** In `SigninExperience.tsx`, replace the local mouse-spotlight `useEffect` + `cardRef` wiring with `const cardRef = useSpotlight<HTMLDivElement>();` (import from `@/lib/interaction/useSpotlight`) and ensure the card keeps the `signin-card` class (its `::before` already provides the sign-in glow; `useSpotlight` just feeds `--spot-x/y`). Remove the now-dead mousemove effect.

- [ ] **Step 2:** Replace the local rotating-headline state machine + markup with `<Typewriter phrases={ROTATING_PHRASES} className="..." />` (import from `@/components/ui/Typewriter`). Keep `ROTATING_PHRASES`. Remove the local `typed`/`phase`/`phraseIdx` state + effect + `widestPhrase`.

- [ ] **Step 3: Add icon-hover CSS** — append to `app/globals.css`:

```css
/* ───────────────────────── Icon hover micro-animations ──────────────────────
   Opt-in classes for inline SVG glyphs. Reduced-motion: no transform. */
.icon-hover-rise { transition: transform 150ms var(--ease-hig, ease); }
.group:hover .icon-hover-rise, .icon-hover-rise:hover { transform: translateY(-1px); }
.icon-hover-nudge { transition: transform 200ms var(--ease-hig, ease); }
.group:hover .icon-hover-nudge { transform: translateX(2px); }
@media (prefers-reduced-motion: reduce) {
  .icon-hover-rise, .icon-hover-nudge { transition: none; transform: none; }
}
```

- [ ] **Step 4: Verify** — `npm run typecheck && npm run lint && npm test && npm run build`. The sign-in page must look/behave identically (extraction is behaviour-preserving). Screenshot review by user.

## Task 10: Document the primitives in `/styleguide` + docs

**Files:** Modify `app/styleguide/page.tsx`, `docs/design-system.md`, `CHANGELOG.md`

- [ ] **Step 1:** Add a "Interaction primitives" section to `/styleguide` demoing: a `.spotlight` `Card` wired with `useSpotlight`, a `Typewriter`, a `GhostDiagram`, a `SuccessFlourish` (re-trigger button), and `AmbientBackground` at each `tone`. Use literal classes so Tailwind emits them.
- [ ] **Step 2:** Document in `docs/design-system.md`: the hooks (`useSpotlight`, `useMagneticHover`), `Typewriter`, `GhostDiagram`, `SuccessFlourish`, `AmbientBackground` `tone`, `readinessScore`, icon-hover classes — with the "reuse + reduced-motion + passive/throttled" guidance. Add a `CHANGELOG` entry.
- [ ] **Step 3: Verify** — `npm run build` (styleguide compiles).

**Phase 1 commit (with user go-ahead):**
```bash
git add lib/interaction components/ui/Typewriter.tsx components/ui/GhostDiagram.tsx components/ui/SuccessFlourish.tsx lib/draft/readiness.ts components/AmbientBackground.tsx components/signin/SigninExperience.tsx app/globals.css app/styleguide/page.tsx docs/design-system.md CHANGELOG.md tests/setup.ts tests/lib/interaction tests/components/ui/Typewriter.test.tsx tests/components/ui/GhostDiagram.test.tsx tests/components/ui/SuccessFlourish.test.tsx tests/components/AmbientBackground.test.tsx tests/lib/draft/readiness.test.ts
git commit -m "feat(atmosphere): foundation — spotlight, magnetic, typewriter, ghost diagram, success flourish, aurora tone, readiness"
```

---

# Phase 2 — Ambient & spotlight (the alive layer)

## Task 11: Spotlight on cards & glass panels

**Files:** Modify `components/Editor.tsx`, `components/drafts/DraftCard.tsx`, `components/Preview.tsx` (working cards), `components/JiraExport.tsx` (cards)

**Reuse:** `useSpotlight` + the `.spotlight` class (Phase 1). Do NOT hand-roll glows.

- [ ] **Step 1:** In each target, attach `const surfaceRef = useSpotlight<HTMLElement>()` to the card/panel root and add `spotlight` to its className. Editor form (`hig-glass-strong`), draft card (`hig-card`), Preview's two working cards, JiraExport's cards. Example (Editor form):
  - `const formRef = useSpotlight<HTMLFormElement>();` then `<form ref={formRef} className={"hig-glass-strong spotlight p-5 ..."}>`.
- [ ] **Step 2: Verify** — `npm run typecheck && npm run lint && npm test && npm run build`. User confirms the glow feel (subtle, hover-only).

## Task 12: Magnetic hover on prominent CTAs

**Files:** Modify `components/ui/Button.tsx`

**Reuse:** `useMagneticHover`. Cleanest single point: apply inside `Button` when `variant === "prominent"` so every prominent CTA gets it without per-callsite wiring.

- [ ] **Step 1:** In `Button`, when `variant === "prominent"`, attach a `useMagneticHover` ref (merge with the forwarded ref via a small `mergeRefs` helper) and ensure the prominent class string includes `transition-transform` so the reset eases. (ButtonLink: same, optional — buttons first.)
- [ ] **Step 2: Test** — extend `tests/components/ui/Button.test.tsx`: a prominent button still renders/click works (the hook is a no-op in jsdom without pointer move). Verify gates + user feel-check (≤6px, barely-there).

## Task 13: Reactive aurora wired from app state

**Files:** Modify `components/StandaloneApp.tsx`, `components/EmbedApp.tsx`

**Reuse:** the `AmbientBackground tone` prop (Phase 1).

- [ ] **Step 1:** In `StandaloneApp`, derive `auroraTone`: `"running"` when `mode.kind === "running"`; `"success"` for ~1.5s after a finalize/export success (a transient `useState` + `useEffect` timer set when `mode.kind` transitions to `"done"`/after export, auto-clearing to `"idle"`); else `"idle"`. Pass `<AmbientBackground tone={auroraTone} />`. Repeat the running/idle logic in `EmbedApp` (no export there → no success state needed, just running/idle).
- [ ] **Step 2: Verify** gates + user confirms the tint shift on run/success is gentle.

## Task 14: Brand-mark easter egg + icon hovers

**Files:** Modify `components/BrandMark.tsx`, `app/globals.css`; apply icon-hover classes where glyphs live (header, Preview/Export CTAs)

- [ ] **Step 1:** `BrandMark` gains an internal click counter; on the Nth click (e.g. 5) it toggles a one-shot `.brandmark-bloom` class on the diamond (a brief red bloom), auto-removed after the animation. No persisted state. Add `.brandmark-bloom` keyframes to `globals.css` (reduced-motion: no-op). Keep `BrandMark` a client component (`"use client"`).
- [ ] **Step 2:** Apply `icon-hover-rise`/`icon-hover-nudge` to a few inline glyphs (e.g. the export arrow → nudge) within `group` hover contexts.
- [ ] **Step 3: Verify** gates + user feel-check.

**Phase 2 commit (with user go-ahead).**

---

# Phase 3 — Empty-state heroes

## Task 15: Typewriter idea-prompts + prefill in the blank editor

**Files:** Modify `components/Editor.tsx`

**Reuse:** `Typewriter` with `onPick`. Prefill writes into the existing draft state (the editor already owns `draft`/`setDraft` + autosave) — no new persistence.

- [ ] **Step 1:** In the blank-editor hero (shown when `isBlankDraft(draft) && !nested`), render a row of clickable `Typewriter` idea-prompts:
  - `const IDEA_PROMPTS = ["Export users as CSV", "Add a payments dashboard", "Rate-limit the public API", "Dark mode for the settings page"];`
  - `<Typewriter phrases={IDEA_PROMPTS} onPick={(p) => applyIdea(p)} className="text-hig-subhead text-accent-link ..." />` where `applyIdea` sets the description (and/or title) on the draft via the existing setter, then the form is no longer blank (hero hides). Use the existing draft-mutation path (do not bypass autosave).
- [ ] **Step 2: Test** — extend `tests/components/Editor.hero.test.tsx`: the hero shows the idea-prompt control (a button); clicking it makes the draft non-blank (hero → compact header). Verify gates.

## Task 16: GhostDiagram in the no-diagrams preview

**Files:** Modify `components/Preview.tsx`

**Reuse:** `GhostDiagram` (Phase 1) inside the existing calm empty-state inset (Task 21 of the polish branch).

- [ ] **Step 1:** In the no-diagrams empty state, place a `<GhostDiagram className="mx-auto h-28 w-48" />` above the existing "No diagrams yet… Create diagrams" copy. Keep copy + the inset.
- [ ] **Step 2: Verify** gates + build; user confirms the wireframe reads as an inviting hint, not clutter.

## Task 17: Diagram-type hover preview

**Files:** Modify `components/DiagramView.tsx`

**Reuse:** `GhostDiagram` styling vocabulary; the existing `SegmentedControl`.

- [ ] **Step 1:** On the flow/sequence/interaction `SegmentedControl`, hovering an option shows a small floating thumbnail (a tiny `GhostDiagram`-style sketch per type) anchored to the control. Keep it `aria-hidden`, pointer-events-none, hover-only; reduced-motion just shows/hides without motion. Scope to where diagrams exist (don't interfere when empty).
- [ ] **Step 2: Verify** gates + build; user feel-check.

**Phase 3 commit (with user go-ahead).**

---

# Phase 4 — Functional-delight

## Task 18: Draft card hover-peek

**Files:** Modify `components/drafts/DraftCard.tsx`

- [ ] **Step 1:** On hover (pointer devices) / focus, expand a mini content preview under the title — for single tasks the existing `item.preview` (currently always shown when present) becomes a hover-revealed, slightly fuller peek; for epics show the task-count line. Use a height/opacity transition gated on `group-hover`/`group-focus-within` (mirror the existing action-row reveal pattern at `DraftCard.tsx`). Reduced-motion: instant. Don't fight the existing hover-lift; keep the confirm-popover behaviour from the recent fix.
- [ ] **Step 2: Test** — extend `tests/components/drafts/DraftsView.test.tsx` or a DraftCard test: the peek content is present in the DOM (revealed via CSS). Verify gates.

## Task 19: Readiness hint in the editor

**Files:** Modify `components/Editor.tsx`

**Reuse:** `readinessScore` (Phase 1); render with tokens + existing type scale.

- [ ] **Step 1:** When the draft is non-blank and not nested, render a subtle 3-segment meter (or thin progress bar) — e.g. in the editor footer near the submit, or the empty side area — using `readinessScore(draft)` / `READINESS_MAX`. Segments fill with `bg-accent-strong`; label reads "Ready to finalize" at 3/3 (`text-ink-tertiary`). Fill transition eased; instant under reduced-motion (global rule handles it). No layout shift when it appears.
- [ ] **Step 2: Test** — extend an Editor test: with a complete draft the hint shows "Ready to finalize"; with a partial draft it shows a partial state. Verify gates.

## Task 20: Shortcut hints

**Files:** Modify `components/Editor.tsx` (and/or the editor footer)

- [ ] **Step 1:** Faint, fade-in shortcut chips in an idle empty area (e.g. near the submit row): "⌘↵ Finalize" etc. — only the shortcuts that are actually wired. Use `text-hig-caption text-ink-tertiary`; appear on idle/focus, unobtrusive. Confirm the shortcut(s) exist before advertising them (don't invent bindings).
- [ ] **Step 2: Verify** gates + user feel-check.

## Task 21: SuccessFlourish on export/finalize success

**Files:** Modify `components/JiraExport.tsx`, `components/RunSheet.tsx`

**Reuse:** `SuccessFlourish` (Phase 1) + the existing `celebrate` beat (already applied in the polish branch).

- [ ] **Step 1:** In `JiraExport`'s success view, mount `<SuccessFlourish />` inside the (now `relative`) success header block, keyed on `result` so it plays once when the export succeeds — alongside the existing `celebrate` motion on the confirmation. In `RunSheet`, mount a `SuccessFlourish` near the finalized check badge when the terminal `finalized` event arrives (reuse the `pop` flag from the recent RunSheet change to gate it).
- [ ] **Step 2: Verify** gates + build; user confirms the flourish is a soft single beat (not loud).

## Task 22: Final docs + full regression

**Files:** Modify `docs/design-system.md`, `CHANGELOG.md`

- [ ] **Step 1:** Ensure all primitives + their per-surface usage are documented; CHANGELOG covers the full atmosphere layer.
- [ ] **Step 2: Full regression** — `npm run typecheck && npm run lint && npm test && npm run build` all green; `npm run test:e2e` (styleguide + drafts pass; the pre-existing finalize/export-metadata failures are unrelated — confirm unchanged).
- [ ] **Step 3: Interaction review** — user verifies feel/perf across all surfaces, light + dark, including reduced-motion (OS setting) — the acceptance gate for "elegant vs. distracting."

**Phase 4 commit (with user go-ahead).**

---

## Self-review notes (author)

- **Spec coverage:** #1 spotlight → Tasks 2/11; #3 reactive aurora → Tasks 7/13; #5 typewriter prompts → Tasks 4/15; #6 ghost diagram → Tasks 5/16; #10 success flourish → Tasks 6/21; #9 magnetic → Tasks 3/12; #11 easter egg → Task 14; #12 icon hovers → Tasks 9/14; #13 draft peek → Task 18; #14 readiness → Tasks 8/19; #15 diagram-type preview → Task 17; #16 shortcut hints → Task 20. Sign-in extraction/DRY → Task 9. Styleguide/docs → Tasks 10/22. All spec sections covered.
- **Reuse emphasis (user directive):** every application task names the Phase-1 primitive it reuses; sign-in is migrated to the extracted primitives (Task 9) to prove no duplication; magnetic hover is centralized in `Button` (Task 12) rather than per-callsite.
- **Type consistency:** `useSpotlight`/`useMagneticHover` return refs; `Typewriter` props `{ phrases, onPick?, className? }`; `GhostDiagram`/`SuccessFlourish` are `HTMLAttributes<HTMLDivElement>`; `AmbientBackground` `tone?: "idle"|"running"|"success"`; `readinessScore(d): number` + `READINESS_MAX`. Used consistently in later tasks.
- **To confirm during execution (flagged, not placeholders):** exact `Draft` field names for `readinessScore` (Task 8 — confirm in `autosave.ts`); the real keyboard shortcut bindings before advertising them (Task 20); whether `ButtonLink` also needs magnetic hover (Task 12 — buttons first). The diagram-type thumbnail content (Task 17) reuses the `GhostDiagram` sketch vocabulary.
- **Reduced-motion + perf:** every primitive guards reduced motion (hooks via `matchMedia`, CSS via the global rule + explicit `@media` blocks); pointer handlers are passive + rAF-throttled.
