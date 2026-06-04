# Motion Foundation + Drafts Panel Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install the app-wide motion system (Framer Motion via the `motion` package) and apply the full polish treatment to the drafts dashboard — refined card anatomy, staggered entrances, animated delete with in-app confirm popover.

**Architecture:** A single `lib/motion.ts` module defines the motion vocabulary (springs, variants, stagger). A thin `MotionRoot` client component applies `MotionConfig reducedMotion="user"` at the app root. The drafts panel consumes the vocabulary: `DraftsView` wraps cards in `AnimatePresence` + `motion.div layout` for stagger-in/shrink-out/reflow; `DraftCard` gets the new anatomy (accent edge, merged epic chip, hover-revealed actions, stretched-link click target); a new shared `ConfirmPopover` replaces `window.confirm`.

**Tech Stack:** Next.js 16 (app router), React 19, `motion` (Framer Motion successor — import from `motion/react`), Tailwind 3 with CSS-variable tokens, Vitest 4 + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-04-app-polish-and-motion-design.md` (this plan covers rollout steps 1–3; editor/epic/panels polish are follow-up plans).

**Deviation from spec (justified):** The spec asks for an e2e delete-via-popover flow. `e2e/drafts.spec.ts` documents that the drafts list body requires live Supabase credentials and that typed-input flows hit a React 19 + Playwright quirk — so e2e stays shell-only, and the delete-via-popover flow is covered by component tests (`DraftCard`, `DraftsDashboard`) instead.

**Conventions used throughout:**
- Comments explain *why*, matching the codebase's comment style.
- All colors/shadows come from existing tokens — nothing hardcoded; verify both themes.
- Run unit tests with `npx vitest run <file>`; typecheck with `npx tsc --noEmit`.

---

### Task 1: Install `motion` and create the motion vocabulary

**Files:**
- Modify: `package.json` (via npm install)
- Create: `lib/motion.ts`
- Test: `tests/lib/motion.test.ts`

- [ ] **Step 1: Install the package**

Run: `npm install motion`
Expected: `motion` appears under `dependencies` in `package.json` (v12.x).

- [ ] **Step 2: Write the failing test**

Create `tests/lib/motion.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { staggerDelay, fadeUp, scaleIn, SPRING } from "@/lib/motion";

describe("staggerDelay", () => {
  it("staggers the first items 40ms apart", () => {
    expect(staggerDelay(0)).toBe(0);
    expect(staggerDelay(1)).toBeCloseTo(0.04);
    expect(staggerDelay(5)).toBeCloseTo(0.2);
  });
  it("caps the delay so long lists don't take seconds to enter", () => {
    expect(staggerDelay(8)).toBeCloseTo(0.32);
    expect(staggerDelay(50)).toBeCloseTo(0.32); // same as the cap
  });
});

describe("variants", () => {
  it("fadeUp resolves a staggered visible transition from the custom index", () => {
    const visible = fadeUp.visible as (i: number) => { transition: { delay: number } };
    expect(visible(2).transition.delay).toBeCloseTo(0.08);
  });
  it("scaleIn enters from 95% scale", () => {
    expect(scaleIn.hidden).toMatchObject({ opacity: 0, scale: 0.95 });
  });
  it("spring is stiff and lightly damped (lively, not bouncy)", () => {
    expect(SPRING).toMatchObject({ type: "spring" });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/lib/motion.test.ts`
Expected: FAIL — `Cannot find module '@/lib/motion'`.

- [ ] **Step 4: Write the implementation**

Create `lib/motion.ts`:

```ts
import type { Transition, Variants } from "motion/react";

// ─── Motion vocabulary ──────────────────────────────────────────────
// Every animated component imports from here; nobody hand-rolls values.
// Division of labor: Framer handles entrances, exits, and layout reflow.
// CSS keeps handling hover/press micro-states (transition-all duration-150
// ease-hig idiom in components).

// Lively-but-professional spring: one subtle overshoot, ~300ms settle.
export const SPRING: Transition = { type: "spring", stiffness: 500, damping: 30, mass: 0.9 };

// Matches the CSS `ease-hig` curve for fast non-spring moments (exits, menus).
export const EASE_HIG = [0.25, 0.1, 0.25, 1] as const;
export const DUR_FAST = 0.15;

const STAGGER_STEP = 0.04;
const STAGGER_CAP = 8;

// First STAGGER_CAP items stagger in; the rest land together at the cap
// delay so a 50-item list doesn't take seconds to finish entering.
export function staggerDelay(index: number): number {
  return Math.min(index, STAGGER_CAP) * STAGGER_STEP;
}

// List/card entrance: fade + rise with spring (staggered via custom={index});
// exit shrinks and fades fast so deletes feel snappy.
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: (index: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { ...SPRING, delay: staggerDelay(index) },
  }),
  exit: { opacity: 0, scale: 0.95, transition: { duration: DUR_FAST, ease: EASE_HIG } },
};

// Menus and popovers: quick scale-in from 95%, faster scale-out.
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: DUR_FAST, ease: EASE_HIG } },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.1, ease: EASE_HIG } },
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/lib/motion.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/motion.ts tests/lib/motion.test.ts
git commit -m "feat(polish): install motion + shared motion vocabulary"
```

---

### Task 2: MotionRoot at the app root + test-environment animation skip

**Files:**
- Create: `components/MotionRoot.tsx`
- Modify: `app/layout.tsx:19` (wrap children)
- Modify: `tests/setup.ts` (skip animations in jsdom)
- Test: `tests/components/MotionRoot.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/MotionRoot.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MotionRoot } from "@/components/MotionRoot";

describe("MotionRoot", () => {
  it("renders its children (motion policy wrapper is transparent)", () => {
    render(
      <MotionRoot>
        <p>hello</p>
      </MotionRoot>,
    );
    expect(screen.getByText("hello")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/MotionRoot.test.tsx`
Expected: FAIL — `Cannot find module '@/components/MotionRoot'`.

- [ ] **Step 3: Write the implementation**

Create `components/MotionRoot.tsx`:

```tsx
"use client";

import { MotionConfig } from "motion/react";

// App-wide motion policy: reducedMotion="user" disables transform/layout
// animations for users with prefers-reduced-motion while keeping opacity
// transitions. app/layout.tsx is a server component, so this thin client
// wrapper exists solely to host MotionConfig at the root.
export function MotionRoot({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
```

- [ ] **Step 4: Wire it into the root layout**

In `app/layout.tsx`, add the import and wrap children:

```tsx
import { MotionRoot } from "@/components/MotionRoot";
```

and change the body line to:

```tsx
      <body className="font-sans antialiased text-ink bg-surface-subtle">
        <MotionRoot>{children}</MotionRoot>
      </body>
```

- [ ] **Step 5: Skip animations in the test environment**

Append to `tests/setup.ts`:

```ts
// Framer Motion in jsdom: skip animations so AnimatePresence doesn't delay
// unmounts behind rAF-driven exit animations — tests assert final states.
import { MotionGlobalConfig } from "motion/react";

MotionGlobalConfig.skipAnimations = true;
```

If `tsc` reports that `motion/react` has no export `MotionGlobalConfig`, import it from `"motion"` instead — the re-export location moved between minor versions.

- [ ] **Step 6: Run tests + typecheck**

Run: `npx vitest run tests/components/MotionRoot.test.tsx && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add components/MotionRoot.tsx app/layout.tsx tests/setup.ts tests/components/MotionRoot.test.tsx
git commit -m "feat(polish): MotionConfig at app root + skip animations in jsdom"
```

---

### Task 3: Shared ConfirmPopover (replaces window.confirm)

**Files:**
- Create: `components/ui/ConfirmPopover.tsx`
- Test: `tests/components/ui/ConfirmPopover.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/ui/ConfirmPopover.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmPopover } from "@/components/ui/ConfirmPopover";

const PROPS = {
  message: "Delete this draft? This can't be undone.",
  confirmLabel: "Delete",
  onConfirm: () => {},
  onCancel: () => {},
};

describe("ConfirmPopover", () => {
  it("renders nothing when closed", () => {
    render(<ConfirmPopover {...PROPS} open={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("shows the message and fires onConfirm", async () => {
    const onConfirm = vi.fn();
    render(<ConfirmPopover {...PROPS} open onConfirm={onConfirm} />);
    expect(screen.getByRole("dialog")).toHaveTextContent("Delete this draft?");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
  it("fires onCancel from the Cancel button", async () => {
    const onCancel = vi.fn();
    render(<ConfirmPopover {...PROPS} open onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
  it("fires onCancel on Escape", async () => {
    const onCancel = vi.fn();
    render(<ConfirmPopover {...PROPS} open onCancel={onCancel} />);
    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledOnce();
  });
  it("fires onCancel on outside click", async () => {
    const onCancel = vi.fn();
    render(
      <div>
        <button>outside</button>
        <ConfirmPopover {...PROPS} open onCancel={onCancel} />
      </div>,
    );
    await userEvent.click(screen.getByRole("button", { name: "outside" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/ui/ConfirmPopover.test.tsx`
Expected: FAIL — `Cannot find module '@/components/ui/ConfirmPopover'`.

- [ ] **Step 3: Write the implementation**

Create `components/ui/ConfirmPopover.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { scaleIn } from "@/lib/motion";
import { Button } from "@/components/ui/Button";

type Props = {
  open: boolean;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

// Small anchored confirm dialog replacing window.confirm. Render it inside a
// relatively-positioned parent (it pops up below the anchor's right edge).
// Escape and outside-click both cancel, matching native dialog expectations.
export function ConfirmPopover({ open, message, confirmLabel, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCancel();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          role="dialog"
          aria-label={message}
          variants={scaleIn}
          initial="hidden"
          animate="visible"
          exit="exit"
          style={{ transformOrigin: "top right" }}
          className="absolute right-0 top-full mt-2 z-20 w-64 hig-card shadow-elevated border border-rule p-3 flex flex-col gap-2.5"
        >
          <p className="text-hig-footnote text-ink text-left">{message}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="button" variant="danger" size="sm" onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/ui/ConfirmPopover.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add components/ui/ConfirmPopover.tsx tests/components/ui/ConfirmPopover.test.tsx
git commit -m "feat(polish): shared ConfirmPopover to replace window.confirm"
```

---

### Task 4: DraftCard redesign (anatomy + hover actions + confirm)

**Files:**
- Modify: `components/drafts/DraftCard.tsx` (full rewrite below)
- Test: `tests/components/drafts/DraftCard.test.tsx` (rewrite — anatomy changed)

New anatomy: mode accent pill on the left edge (accent for Epic, gray for Single), title is a stretched link (whole card clickable), epic chip merges the task count (`Epic · 3 tasks`, sourced from `preview` which is already `"N tasks"` for epics — see `lib/drafts/payload.ts:40`), preview paragraph only renders for single drafts, actions fade in on hover (always visible on touch / keyboard focus), Delete opens the ConfirmPopover.

- [ ] **Step 1: Rewrite the test file**

Replace the contents of `tests/components/drafts/DraftCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DraftCard } from "@/components/drafts/DraftCard";

const ITEM = {
  id: "d1",
  workingTitle: "Export users",
  mode: "single",
  updatedAt: "2026-06-03T11:30:00Z",
  preview: "We need a CSV export",
};

const EPIC = {
  id: "e1",
  workingTitle: "Checkout revamp",
  mode: "epic",
  updatedAt: "2026-06-03T11:30:00Z",
  preview: "3 tasks",
};

describe("DraftCard", () => {
  it("renders title, preview, time, and an Open link to the editor", () => {
    render(<DraftCard item={ITEM} now={new Date("2026-06-03T12:00:00Z").getTime()} onDelete={() => {}} />);
    expect(screen.getByText("We need a CSV export")).toBeInTheDocument();
    expect(screen.getByText("30m ago")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open/i })).toHaveAttribute("href", "/?draft=d1");
  });
  it("makes the whole card clickable via a stretched title link", () => {
    render(<DraftCard item={ITEM} now={Date.now()} onDelete={() => {}} />);
    expect(screen.getByRole("link", { name: "Export users" })).toHaveAttribute("href", "/?draft=d1");
  });
  it("asks for confirmation before deleting", async () => {
    const onDelete = vi.fn();
    render(<DraftCard item={ITEM} now={Date.now()} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(onDelete).not.toHaveBeenCalled(); // no immediate delete
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith("d1");
  });
  it("cancelling the confirm keeps the draft", async () => {
    const onDelete = vi.fn();
    render(<DraftCard item={ITEM} now={Date.now()} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("merges the task count into the Epic chip and hides the redundant preview", () => {
    render(<DraftCard item={EPIC} now={new Date("2026-06-03T12:00:00Z").getTime()} onDelete={() => {}} />);
    expect(screen.getByText("Epic · 3 tasks")).toBeInTheDocument();
    // preview text "3 tasks" must not ALSO render as a paragraph
    expect(screen.getAllByText(/3 tasks/)).toHaveLength(1);
  });
  it("renders a Single chip for single drafts", () => {
    render(<DraftCard item={ITEM} now={Date.now()} onDelete={() => {}} />);
    expect(screen.getByText("Single")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify the new expectations fail**

Run: `npx vitest run tests/components/drafts/DraftCard.test.tsx`
Expected: FAIL — stretched-link, confirm-dialog, and merged-chip tests fail against the old component.

- [ ] **Step 3: Rewrite the component**

Replace the contents of `components/drafts/DraftCard.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ConfirmPopover } from "@/components/ui/ConfirmPopover";
import { formatRelativeTime } from "@/lib/drafts/time";
import type { DraftListItem } from "@/lib/drafts/payload";

type Props = {
  item: DraftListItem;
  now?: number;
  onDelete: (id: string) => void;
};

export function DraftCard({ item, now, onDelete }: Props) {
  // Capture a stable "now" once (lazy init) when the caller doesn't supply one,
  // so render stays pure — Date.now() in the render body is a lint error here.
  const [fallbackNow] = useState(() => Date.now());
  const [confirming, setConfirming] = useState(false);
  const effectiveNow = now ?? fallbackNow;
  const epic = item.mode === "epic";

  return (
    <div
      className={
        "group relative hig-card border border-transparent p-4 pl-6 flex flex-col gap-2 " +
        "transition-all duration-150 ease-hig hover:-translate-y-0.5 hover:shadow-elevated hover:border-accent/25"
      }
    >
      {/* Mode accent pill — inset so it never fights the card's rounded corners. */}
      <span
        aria-hidden
        className={
          "absolute left-2 top-3 bottom-3 w-[3px] rounded-full " +
          (epic ? "bg-accent" : "bg-ink-quaternary")
        }
      />
      <div className="flex items-center gap-3 min-w-0">
        <h3 className="text-hig-headline min-w-0 truncate">
          {/* Stretched link: makes the whole card the click target while the
              action buttons below sit above it on their own z layer. */}
          <Link href={`/?draft=${item.id}`} className="after:absolute after:inset-0 focus-visible:outline-none">
            {item.workingTitle}
          </Link>
        </h3>
        <span
          className={
            "shrink-0 rounded-full px-2 py-0.5 text-hig-caption font-medium " +
            (epic ? "bg-accent-tint text-accent" : "bg-surface-muted text-ink-secondary")
          }
        >
          {/* For epics the list preview IS the task count ("3 tasks") — fold it
              into the chip instead of repeating it as a paragraph below. */}
          {epic ? `Epic · ${item.preview}` : "Single"}
        </span>
        <span className="ml-auto text-hig-footnote text-ink-tertiary shrink-0">
          {formatRelativeTime(item.updatedAt, effectiveNow)}
        </span>
      </div>
      {!epic && item.preview && (
        <p className="text-hig-footnote text-ink-secondary line-clamp-2">{item.preview}</p>
      )}
      <div
        className={
          // Hidden until hover on pointer devices; always visible on touch
          // (no hover) and while focused so keyboard users never lose them.
          "relative z-10 flex items-center justify-end gap-2 pt-1 " +
          "transition-opacity duration-150 ease-hig " +
          "[@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        }
      >
        <div className="relative">
          <Button type="button" variant="danger" size="sm" onClick={() => setConfirming(true)}>
            Delete
          </Button>
          <ConfirmPopover
            open={confirming}
            message="Delete this draft? This can't be undone."
            confirmLabel="Delete"
            onConfirm={() => {
              setConfirming(false);
              onDelete(item.id);
            }}
            onCancel={() => setConfirming(false)}
          />
        </div>
        <Link
          href={`/?draft=${item.id}`}
          className="inline-flex items-center justify-center gap-1.5 rounded-md font-medium h-7 px-2.5 text-hig-footnote bg-accent text-white hover:bg-accent-hover transition-colors"
        >
          Open
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/drafts/DraftCard.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add components/drafts/DraftCard.tsx tests/components/drafts/DraftCard.test.tsx
git commit -m "feat(polish): DraftCard redesign — accent edge, hover actions, confirm popover"
```

---

### Task 5: DraftsView — staggered entrance, animated exit, skeleton + empty states

**Files:**
- Modify: `components/drafts/DraftsView.tsx` (full rewrite below)
- Test: `tests/components/drafts/DraftsView.test.tsx` (extend)

- [ ] **Step 1: Extend the test file**

Replace the contents of `tests/components/drafts/DraftsView.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DraftsView } from "@/components/drafts/DraftsView";

const ITEMS = [
  { id: "d1", workingTitle: "X", mode: "single", updatedAt: "2026-06-03T12:00:00Z", preview: "p" },
  { id: "d2", workingTitle: "Y", mode: "epic", updatedAt: "2026-06-03T12:00:00Z", preview: "2 tasks" },
];

describe("DraftsView", () => {
  it("shows skeleton cards while loading", () => {
    render(<DraftsView state={{ kind: "loading" }} onDelete={() => {}} onRetry={() => {}} />);
    expect(screen.getByTestId("drafts-loading")).toBeInTheDocument();
  });
  it("shows an empty state with a CTA to the creator", () => {
    render(<DraftsView state={{ kind: "empty" }} onDelete={() => {}} onRetry={() => {}} />);
    expect(screen.getByText(/no drafts yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create a task/i })).toHaveAttribute("href", "/");
  });
  it("shows an error state with a Retry button", async () => {
    const onRetry = vi.fn();
    render(
      <DraftsView state={{ kind: "error", message: "We couldn't load your drafts." }} onDelete={() => {}} onRetry={onRetry} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't load your drafts.");
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalled();
  });
  it("renders all cards when loaded", () => {
    render(<DraftsView state={{ kind: "loaded", items: ITEMS }} onDelete={() => {}} onRetry={() => {}} />);
    expect(screen.getByText("X")).toBeInTheDocument();
    expect(screen.getByText("Y")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to confirm current state**

Run: `npx vitest run tests/components/drafts/DraftsView.test.tsx`
Expected: PASS already (the rewrite preserves roles/text) — these tests are the safety net for the visual rewrite. If any fail, fix the test data, not the component.

- [ ] **Step 3: Rewrite the component**

Replace the contents of `components/drafts/DraftsView.tsx`:

```tsx
"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { DraftCard } from "./DraftCard";
import { fadeUp } from "@/lib/motion";
import type { DraftListItem } from "@/lib/drafts/payload";

export type DraftsState =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; items: DraftListItem[] };

type Props = {
  state: DraftsState;
  onDelete: (id: string) => void;
  onRetry: () => void;
};

export function DraftsView({ state, onDelete, onRetry }: Props) {
  if (state.kind === "loading") {
    // Skeletons match the real card silhouette (title row + chip + preview)
    // so the loaded list doesn't jump.
    return (
      <div data-testid="drafts-loading" className="flex flex-col gap-3" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="hig-card p-4 pl-6 flex flex-col gap-2.5 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="h-4 w-44 rounded bg-surface-inset" />
              <div className="h-4 w-14 rounded-full bg-surface-inset" />
              <div className="ml-auto h-3 w-12 rounded bg-surface-inset" />
            </div>
            <div className="h-3 w-3/4 rounded bg-surface-inset" />
          </div>
        ))}
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <motion.div variants={fadeUp} initial="hidden" animate="visible" className="flex flex-col items-start gap-3">
        <div className="rounded-md bg-danger/5 border border-danger/30 px-4 py-2.5 w-full" role="alert">
          <p className="text-hig-footnote text-danger">{state.message}</p>
        </div>
        <Button type="button" variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      </motion.div>
    );
  }
  if (state.kind === "empty") {
    return (
      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        className="hig-card p-8 flex flex-col items-center gap-3 text-center"
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-tint" aria-hidden>
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
            <path d="M9 13h6M9 17h4" />
          </svg>
        </span>
        <h2 className="text-hig-title3">No drafts yet</h2>
        <p className="text-hig-footnote text-ink-secondary">
          Drafts you save will show up here so you can pick them back up anytime.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-1.5 rounded-md font-medium h-9 px-3.5 text-hig-subhead bg-accent text-white hover:bg-accent-hover transition-colors"
        >
          Create a task
        </Link>
      </motion.div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {/* popLayout pops exiting cards out of the layout flow so the
          remaining cards reflow smoothly (layout) while the deleted one
          shrinks and fades in place. */}
      <AnimatePresence mode="popLayout">
        {state.items.map((item, i) => (
          <motion.div
            key={item.id}
            layout
            custom={i}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <DraftCard item={item} onDelete={onDelete} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 4: Run the drafts component tests**

Run: `npx vitest run tests/components/drafts/`
Expected: PASS (DraftCard + DraftsView).

- [ ] **Step 5: Commit**

```bash
git add components/drafts/DraftsView.tsx tests/components/drafts/DraftsView.test.tsx
git commit -m "feat(polish): DraftsView stagger entrance, animated delete, skeleton + empty states"
```

---

### Task 6: DraftsDashboard — drop window.confirm, animate-out delete

**Files:**
- Modify: `components/drafts/DraftsDashboard.tsx:37-53` (onDelete callback)
- Test: `tests/components/drafts/DraftsDashboard.test.tsx` (new)

The confirm now lives in DraftCard's popover, so the dashboard deletes immediately when called. Instead of refetching the whole list (which would flash skeletons and kill the exit animation), filter the deleted item out of state — `AnimatePresence` animates it out and the list reflows.

- [ ] **Step 1: Write the failing test**

Create `tests/components/drafts/DraftsDashboard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DraftsDashboard } from "@/components/drafts/DraftsDashboard";

const DRAFTS = [
  { id: "d1", workingTitle: "First draft", mode: "single", updatedAt: "2026-06-03T12:00:00Z", preview: "one" },
  { id: "d2", workingTitle: "Second draft", mode: "single", updatedAt: "2026-06-03T12:00:00Z", preview: "two" },
];

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

function jsonResponse(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

describe("DraftsDashboard", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads and renders drafts", async () => {
    mockFetch(() => jsonResponse({ drafts: DRAFTS }));
    render(<DraftsDashboard />);
    expect(await screen.findByText("First draft")).toBeInTheDocument();
    expect(screen.getByText("Second draft")).toBeInTheDocument();
  });

  it("delete flow: confirm popover → DELETE request → card removed without a refetch", async () => {
    const calls: Array<{ url: string; method?: string }> = [];
    mockFetch((url, init) => {
      calls.push({ url: String(url), method: init?.method });
      if (init?.method === "DELETE") return jsonResponse({}, 200);
      return jsonResponse({ drafts: DRAFTS });
    });
    render(<DraftsDashboard />);
    await screen.findByText("First draft");

    // Delete the first card via its confirm popover.
    await userEvent.click(screen.getAllByRole("button", { name: /delete/i })[0]);
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.queryByText("First draft")).not.toBeInTheDocument());
    expect(screen.getByText("Second draft")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "DELETE" && c.url.includes("/api/drafts/d1"))).toBe(true);
    // No second GET — state is filtered locally so the exit animation plays.
    expect(calls.filter((c) => c.method === undefined || c.method === "GET")).toHaveLength(1);
  });

  it("keeps the card and shows an error when delete fails", async () => {
    mockFetch((url, init) => {
      if (init?.method === "DELETE") return jsonResponse({}, 500);
      return jsonResponse({ drafts: DRAFTS });
    });
    render(<DraftsDashboard />);
    await screen.findByText("First draft");
    await userEvent.click(screen.getAllByRole("button", { name: /delete/i })[0]);
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't delete/i);
  });

  it("shows the empty state after deleting the last draft", async () => {
    mockFetch((url, init) => {
      if (init?.method === "DELETE") return jsonResponse({}, 200);
      return jsonResponse({ drafts: [DRAFTS[0]] });
    });
    render(<DraftsDashboard />);
    await screen.findByText("First draft");
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText(/no drafts yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/drafts/DraftsDashboard.test.tsx`
Expected: FAIL — the current implementation calls `window.confirm` (jsdom throws "not implemented" or the spy never fires) and refetches after delete.

- [ ] **Step 3: Update the onDelete callback**

In `components/drafts/DraftsDashboard.tsx`, replace the `onDelete` callback (currently lines 37–53) with:

```tsx
  // Confirmation lives in DraftCard's popover now. On success, filter the
  // item out locally instead of refetching — a refetch would flash skeletons
  // and cut off the card's exit animation.
  const onDelete = useCallback(async (id: string) => {
    const { url, method } = deleteDraftRequest(id);
    try {
      const res = await fetch(url, { method, credentials: "same-origin" });
      if (!res.ok && res.status !== 404) {
        setState({ kind: "error", message: "We couldn't delete that draft. Please try again." });
        return;
      }
      setState((prev) => {
        if (prev.kind !== "loaded") return prev;
        const items = prev.items.filter((it) => it.id !== id);
        return items.length ? { kind: "loaded", items } : { kind: "empty" };
      });
    } catch {
      setState({ kind: "error", message: "We couldn't delete that draft. Please try again." });
    }
  }, []);
```

(The `[load]` dependency array becomes `[]` — `load` is no longer used here.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/drafts/DraftsDashboard.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add components/drafts/DraftsDashboard.tsx tests/components/drafts/DraftsDashboard.test.tsx
git commit -m "feat(polish): delete via confirm popover with animated card exit"
```

---

### Task 7: Full verification + manual QA

**Files:** none new — verification only.

- [ ] **Step 1: Full unit test suite**

Run: `npm test`
Expected: all suites PASS. If any unrelated suite fails, STOP and investigate — do not commit over a red suite.

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean. (Watch for the `MotionGlobalConfig` import-location note in Task 2.)

- [ ] **Step 3: E2E shell tests**

Run: `npm run test:e2e -- e2e/drafts.spec.ts`
Expected: PASS — both shell tests are unaffected (links/headings unchanged).

- [ ] **Step 4: Manual QA checklist (needs `npm run dev` + Supabase creds)**

Ask the user to verify in the browser, light AND dark theme:
1. `/drafts` with drafts: cards stagger in; hover lifts a card and reveals Delete/Open; whole card click opens the draft.
2. Delete → popover appears anchored to the button; Escape/outside-click closes it; confirm → card shrinks out and the list reflows.
3. Deleting the last draft lands on the empty state with the document medallion.
4. OS reduced-motion enabled → no transform animations, content still appears.

- [ ] **Step 5: Commit any QA fixes, then push**

```bash
git push origin main
```

---

## Self-Review (completed)

- **Spec coverage (rollout steps 1–3):** motion vocabulary + root config (Tasks 1–2), drafts card anatomy/hover/stagger/delete-reflow/skeleton/empty (Tasks 4–5), ConfirmPopover replacing the only `window.confirm` call site (Tasks 3, 6). Editor/epic/panels are explicitly deferred to follow-up plans.
- **Placeholders:** none — every step has complete code or an exact command.
- **Type consistency:** `fadeUp`/`scaleIn`/`staggerDelay`/`SPRING` defined in Task 1 match all later usages; `ConfirmPopover` props match call site in Task 4; `DraftsState` shape unchanged from current code.
