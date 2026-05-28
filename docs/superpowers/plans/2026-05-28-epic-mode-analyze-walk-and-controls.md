# Epic Mode — Analyze walk, forced kneading, Clear + Back controls — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Force a kneading interview on every epic, replace silent batch refinement with a per-task Help-style chat walk, and add Clear-current-draft + phase-by-phase Back controls.

**Architecture:** Layered change. Pure logic (knead retry + fallback) lands first so server tests stay deterministic. Two presentational leaf components (ClearDraftButton, BackBar) plus a `walkInfo` extension to HelpPanel land next. StandaloneApp wires the analyze-walk state machine (`analyzeChatById`, `analyzeTaskId`, `walking`), the clear-draft handler, and the phase-back mount points; EpicTabs and EpicTaskEditor pick up the new buttons.

**Tech Stack:** Vitest 4.1 (jsdom 25) for unit/component tests, React 19 + Next 16 App Router, TipTap 3.23, Tailwind 3.4 with HIG tokens, Anthropic Claude Agent SDK + `TASK_AGENT_MODE=stub` transport.

**Test runner:** `pnpm test <pattern>` runs `vitest run --passWithNoTests`. Whole suite: `pnpm test`. Typecheck: `pnpm typecheck`. Lint: `pnpm lint`.

**Per-task hygiene:** every commit uses targeted `git add` for only the files this task touches. Never sweep `prompts/types/*` (template-sync side effect on dev start).

---

## File Map

**Create:**
- `lib/knead/fallback.ts` — deterministic first-round questions used when the model misbehaves twice.
- `tests/lib/knead-fallback.test.ts`
- `components/ClearDraftButton.tsx` — inline-confirm clear button.
- `tests/components/ClearDraftButton.test.tsx`
- `components/epic/BackBar.tsx` — `← Back` button with optional confirm.
- `tests/components/epic/BackBar.test.tsx`

**Modify:**
- `skills/task-knead/SKILL.md` — add the "always ask at least one round" rule.
- `lib/agent/index.ts` — `runKnead` retry + fallback guard.
- `tests/lib/agent.test.ts` — guard coverage.
- `components/HelpPanel.tsx` — optional `walkInfo` prop with `Walk N/M` chip + Next/Stop buttons.
- `tests/components/HelpPanel.test.tsx` — walk header coverage (if file exists; else create).
- `components/Editor.tsx` — `onClear?` prop, render `ClearDraftButton` in the footer next to **Help**.
- `tests/components/Editor.test.tsx` — Clear interaction.
- `components/StandaloneApp.tsx` — `analyzeChatById` / `analyzeTaskId` / `walking` state, `clearVisibleDraft` handler, BackBar mounts, panel mutual exclusion, hydrate per-task chat history.
- `components/epic/EpicTabs.tsx` — replace lone **Analyze all** button with `Analyze all` (walk) + per-tab analyze handoff; add **← Back to kneading** BackBar.
- `components/epic/EpicTaskEditor.tsx` — **Analyze this task** button next to **Delete task**.
- `components/epic/review/ReviewerMode.tsx` — relabel **Edit tasks** to **← Back to tabs**.
- `tests/components/epic/EpicTabs.test.tsx` — toolbar buttons + walk dispatch.
- `tests/components/StandaloneApp.test.tsx` — integration: analyze walk advances, clear-draft scoped to namespace, BackBar transitions.

---

## Task 1: Knead skill rule — always ask one round first

**Files:**
- Modify: `skills/task-knead/SKILL.md`

- [ ] **Step 1: Update the Rules block**

Open `skills/task-knead/SKILL.md`. Find the `**Rules:**` section (line ~55). Replace its current bullet list with:

```markdown
**Rules:**

- Cover both `business` (users, value, surfaces, success metrics, scope) and
  `technical` (data, integrations, scalability, edge cases) dimensions.
- **Always ask at least one round of questions before returning `complete`.**
  Even a clearly-scoped epic benefits from a short scoping pass. On the first
  round prefer 3–6 high-signal questions covering surfaces, users, success
  criteria, and the biggest technical risk. If the request includes
  `mustAskFirstRound: true`, you MUST emit a `questions` block this turn —
  do not return `complete`.
- At most **25** questions per round. Ask only what the prior answers leave open.
- Each question needs a stable, unique `id` (kebab-case), a `prompt`, a
  `section` of `business` or `technical`, and a `type`:
  - `text` — open answer, no `options`.
  - `single` — choose one; include 2+ `options`.
  - `multi` — choose any; include 2+ `options`.
- If `roundNumber` is greater than `maxFreeRounds` and `overrideCapApproved` is
  false, and you still need more questions, include a short `justification`
  string on the `questions` object explaining why more context is required.
- After the first round, prefer `complete` over padding with low-value questions.
```

Also amend the input shape comment (line ~12) to mention the new field:

```json
{
  "epicDescription": "free-form epic text",
  "rounds": [ /* prior rounds */ ],
  "roundNumber": 2,
  "maxFreeRounds": 5,
  "overrideCapApproved": false,
  "mustAskFirstRound": false
}
```

- [ ] **Step 2: Commit**

```bash
git add skills/task-knead/SKILL.md
git commit -m "feat(AI-36): require >=1 kneading round before complete

Add explicit rule to task-knead skill: always ask at least one round of
questions before returning kind: complete, and honour mustAskFirstRound
when the route forces a retry.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Deterministic fallback round

**Files:**
- Create: `lib/knead/fallback.ts`
- Create: `tests/lib/knead-fallback.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/knead-fallback.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { FALLBACK_FIRST_ROUND } from "@/lib/knead/fallback";
import { KneadQuestionSchema } from "@/lib/knead/parse";

describe("FALLBACK_FIRST_ROUND", () => {
  it("contains at least three questions covering both sections", () => {
    expect(FALLBACK_FIRST_ROUND.length).toBeGreaterThanOrEqual(3);
    const sections = new Set(FALLBACK_FIRST_ROUND.map((q) => q.section));
    expect(sections.has("business")).toBe(true);
    expect(sections.has("technical")).toBe(true);
  });

  it("every question parses under KneadQuestionSchema", () => {
    for (const q of FALLBACK_FIRST_ROUND) {
      expect(() => KneadQuestionSchema.parse(q)).not.toThrow();
    }
  });

  it("every question has a stable kebab-case id", () => {
    for (const q of FALLBACK_FIRST_ROUND) {
      expect(q.id).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/lib/knead-fallback.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/knead/fallback'`.

- [ ] **Step 3: Create the fallback module**

Create `lib/knead/fallback.ts`:

```ts
import type { KneadQuestion } from "./types";

// Deterministic first-round fallback used when the model returns `complete`
// before asking a single question. Three sturdy questions — two business,
// one technical — that any epic benefits from.
export const FALLBACK_FIRST_ROUND: KneadQuestion[] = [
  {
    id: "q-surfaces",
    prompt: "Which product surfaces are impacted?",
    section: "business",
    type: "multi",
    options: ["Web app", "Admin console", "API", "Mobile", "Background jobs"],
  },
  {
    id: "q-users",
    prompt: "Who is the primary user benefiting from this work?",
    section: "business",
    type: "text",
  },
  {
    id: "q-risk",
    prompt: "What is the biggest technical risk to delivering this?",
    section: "technical",
    type: "text",
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test tests/lib/knead-fallback.test.ts
```

Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add lib/knead/fallback.ts tests/lib/knead-fallback.test.ts
git commit -m "feat(AI-36): deterministic fallback first round of kneading

Used by the /api/knead route when the model returns kind: complete
before asking any questions. Three KneadQuestionSchema-valid questions
covering both business and technical sections.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `runKnead` retry + fallback guard

**Files:**
- Modify: `lib/agent/index.ts:384-417`
- Modify: `tests/lib/agent.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/lib/agent.test.ts`:

```ts
import { runKnead } from "@/lib/agent";
import { FALLBACK_FIRST_ROUND } from "@/lib/knead/fallback";

function scriptedTransport(replies: string[]): import("@/lib/agent/types").AgentTransport {
  let i = 0;
  return {
    async runRole({ onEvent }) {
      const text = replies[Math.min(i, replies.length - 1)];
      i++;
      onEvent({ type: "token", text });
    },
  };
}

describe("runKnead guard", () => {
  it("retries once with mustAskFirstRound when first call returns complete on empty rounds", async () => {
    const transport = scriptedTransport([
      JSON.stringify({ kind: "complete" }),
      JSON.stringify({
        kind: "questions",
        questions: [
          { id: "q-a", prompt: "A?", section: "business", type: "text" },
        ],
      }),
    ]);
    const outcome = await runKnead({ epicDescription: "do a thing", rounds: [], transport });
    expect(outcome.kind).toBe("questions");
    if (outcome.kind === "questions") {
      expect(outcome.round.questions[0].id).toBe("q-a");
    }
  });

  it("falls back to FALLBACK_FIRST_ROUND when retry also returns complete", async () => {
    const transport = scriptedTransport([
      JSON.stringify({ kind: "complete" }),
      JSON.stringify({ kind: "complete" }),
    ]);
    const outcome = await runKnead({ epicDescription: "do a thing", rounds: [], transport });
    expect(outcome.kind).toBe("questions");
    if (outcome.kind === "questions") {
      expect(outcome.round.questions.map((q) => q.id)).toEqual(
        FALLBACK_FIRST_ROUND.map((q) => q.id),
      );
    }
  });

  it("does not retry when rounds is non-empty (subsequent calls may legitimately return complete)", async () => {
    const calls: string[] = [];
    const transport: import("@/lib/agent/types").AgentTransport = {
      async runRole({ userMessage, onEvent }) {
        calls.push(userMessage);
        onEvent({ type: "token", text: JSON.stringify({ kind: "complete" }) });
      },
    };
    const outcome = await runKnead({
      epicDescription: "x",
      rounds: [{ questions: [{ id: "q1", prompt: "?", section: "business", type: "text" }], answers: { q1: "yes" } }],
      transport,
    });
    expect(outcome.kind).toBe("complete");
    expect(calls.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test tests/lib/agent.test.ts -t "runKnead guard"
```

Expected: 3 failures — the current `runKnead` returns `{ kind: "complete" }` on the first call without retry, so test 1 + 2 fail; test 3 already passes (1/3 may pass — that's fine).

- [ ] **Step 3: Wire the guard in `runKnead`**

In `lib/agent/index.ts`, replace the existing `runKnead` body (lines 384–417) with:

```ts
export async function runKnead(args: {
  epicDescription: string;
  rounds: KneadRound[];
  overrideCapApproved?: boolean;
  transport: AgentTransport;
  signal?: AbortSignal;
}): Promise<KneadOutcome> {
  const systemPrompt = await loadSkillPrompt("task-knead");
  const buildMessage = (mustAskFirstRound: boolean) =>
    JSON.stringify({
      epicDescription: args.epicDescription,
      rounds: args.rounds,
      roundNumber: args.rounds.length + 1,
      maxFreeRounds: 5,
      overrideCapApproved: Boolean(args.overrideCapApproved),
      mustAskFirstRound,
    });

  async function callModel(userMessage: string): Promise<string> {
    let buffer = "";
    let pending: Error | null = null;
    await args.transport.runRole({
      role: "knead",
      systemPrompt,
      userMessage,
      cwd: process.cwd(),
      signal: args.signal,
      onEvent: (e) => {
        if (e.type === "token") buffer += e.text;
        else if (e.type === "error") pending = new Error(`${e.code}: ${e.message}`);
      },
    });
    if (pending) throw pending;
    return buffer;
  }

  // First call.
  let raw = await callModel(buildMessage(false));
  let result = parseKneadResponse(raw);

  // Guard: never let the very first round return `complete` without questions.
  // Try once more with mustAskFirstRound=true; if the model still misbehaves,
  // emit the deterministic fallback round so the UI is never stranded.
  if (args.rounds.length === 0 && result.kind === "complete") {
    raw = await callModel(buildMessage(true));
    try {
      result = parseKneadResponse(raw);
    } catch {
      result = { kind: "questions", questions: [...FALLBACK_FIRST_ROUND] };
    }
    if (result.kind === "complete") {
      result = { kind: "questions", questions: [...FALLBACK_FIRST_ROUND] };
    }
  }

  return applyCap(result, args.rounds.length, Boolean(args.overrideCapApproved));
}
```

Add the import at the top of `lib/agent/index.ts` near the other knead imports (line 17 area):

```ts
import { FALLBACK_FIRST_ROUND } from "@/lib/knead/fallback";
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test tests/lib/agent.test.ts
```

Expected: full file passes (existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add lib/agent/index.ts tests/lib/agent.test.ts
git commit -m "feat(AI-36): runKnead guards >=1 round on first call

Adds a retry-once-then-fallback wrapper to runKnead: when the request
has no prior rounds and the model returns kind: complete, retry the
call with mustAskFirstRound=true. If the retry also returns complete
(or fails to parse), emit FALLBACK_FIRST_ROUND so the UI always shows
an interview form for the first round.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `ClearDraftButton` component

**Files:**
- Create: `components/ClearDraftButton.tsx`
- Create: `tests/components/ClearDraftButton.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/ClearDraftButton.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClearDraftButton } from "@/components/ClearDraftButton";

describe("<ClearDraftButton>", () => {
  it("renders a Clear button by default and asks for confirm on click", async () => {
    const onConfirm = vi.fn();
    render(<ClearDraftButton onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: /^clear$/i }));
    // After first click, inline confirm is shown.
    expect(screen.getByText(/clear this draft\?/i)).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("fires onConfirm when the user confirms", async () => {
    const onConfirm = vi.fn();
    render(<ClearDraftButton onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: /^clear$/i }));
    await userEvent.click(screen.getByRole("button", { name: /^yes$/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("cancels without firing onConfirm", async () => {
    const onConfirm = vi.fn();
    render(<ClearDraftButton onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: /^clear$/i }));
    await userEvent.click(screen.getByRole("button", { name: /^no$/i }));
    expect(onConfirm).not.toHaveBeenCalled();
    // Returns to the default Clear button.
    expect(screen.getByRole("button", { name: /^clear$/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/components/ClearDraftButton.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/ClearDraftButton'`.

- [ ] **Step 3: Implement the component**

Create `components/ClearDraftButton.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

type Props = {
  onConfirm: () => void;
  label?: string;
  disabled?: boolean;
};

export function ClearDraftButton({ onConfirm, label = "Clear", disabled = false }: Props) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="md"
        disabled={disabled}
        onClick={() => setConfirming(true)}
      >
        {label}
      </Button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-hig-footnote text-ink-secondary">Clear this draft?</span>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => {
          setConfirming(false);
          onConfirm();
        }}
      >
        Yes
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        No
      </Button>
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test tests/components/ClearDraftButton.test.tsx
```

Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add components/ClearDraftButton.tsx tests/components/ClearDraftButton.test.tsx
git commit -m "feat(AI-36): ClearDraftButton with inline confirm

A small ghost button that swaps to an inline 'Clear this draft? Yes / No'
on click. Fires onConfirm only after explicit confirmation; cancel
returns to the default state without firing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `BackBar` component

**Files:**
- Create: `components/epic/BackBar.tsx`
- Create: `tests/components/epic/BackBar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/epic/BackBar.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BackBar } from "@/components/epic/BackBar";

describe("<BackBar>", () => {
  it("renders the back label and fires onBack immediately when no confirm is set", async () => {
    const onBack = vi.fn();
    render(<BackBar label="Back to tabs" onBack={onBack} />);
    await userEvent.click(screen.getByRole("button", { name: /back to tabs/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("shows the confirm prompt and waits for Yes when confirmMessage is given", async () => {
    const onBack = vi.fn();
    render(<BackBar label="Back to kneading" confirmMessage="This will clear tasks." onBack={onBack} />);
    await userEvent.click(screen.getByRole("button", { name: /back to kneading/i }));
    expect(screen.getByText(/this will clear tasks\./i)).toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /^yes$/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("cancels confirm without firing onBack", async () => {
    const onBack = vi.fn();
    render(<BackBar label="Back" confirmMessage="Sure?" onBack={onBack} />);
    await userEvent.click(screen.getByRole("button", { name: /^back$/i }));
    await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onBack).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^back$/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/components/epic/BackBar.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/epic/BackBar'`.

- [ ] **Step 3: Implement the component**

Create `components/epic/BackBar.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

type Props = {
  label: string;
  confirmMessage?: string;
  onBack: () => void;
};

export function BackBar({ label, confirmMessage, onBack }: Props) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <div className="flex items-center">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => (confirmMessage ? setConfirming(true) : onBack())}
        >
          ← {label}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md bg-warning-tint border border-warning/40 px-3 py-2">
      <span className="text-hig-footnote text-ink flex-1">{confirmMessage}</span>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => {
          setConfirming(false);
          onBack();
        }}
      >
        Yes
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test tests/components/epic/BackBar.test.tsx
```

Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add components/epic/BackBar.tsx tests/components/epic/BackBar.test.tsx
git commit -m "feat(AI-36): BackBar component for phase-by-phase navigation

A small ghost button labelled '← <label>'. When a confirmMessage is
given, click swaps to an inline warning-tinted confirm strip with Yes
and Cancel buttons; only Yes fires onBack.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: HelpPanel walk header (`walkInfo` prop)

**Files:**
- Modify: `components/HelpPanel.tsx`
- Modify (or create): `tests/components/HelpPanel.test.tsx`

- [ ] **Step 1: Inspect current HelpPanel header**

Confirm the header block in `components/HelpPanel.tsx` (around lines 188–209) renders a single `Close` button and a `Review N changes` button. We will insert the walk controls between them when `walkInfo` is provided.

- [ ] **Step 2: Write the failing test**

Create `tests/components/HelpPanel.test.tsx` if it does not exist (skip writing the auto-scan tests — they require fetch mocking; we only test the walk header here):

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HelpPanel } from "@/components/HelpPanel";
import { EMPTY_DRAFT } from "@/lib/draft/autosave";

// Help auto-scans on mount via fetch. Stub it so the panel renders quietly.
beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ text: "Nothing to add.", done: false }),
  }) as unknown as typeof fetch;
});
afterEach(() => { vi.restoreAllMocks(); });

describe("<HelpPanel> walk header", () => {
  it("does not render walk controls when walkInfo is omitted", () => {
    render(
      <HelpPanel
        surface="editor"
        draft={EMPTY_DRAFT}
        history={[]}
        onUpdateHistory={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: /next task/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /stop walk/i })).toBeNull();
  });

  it("renders 'Walk N/M' chip and Next + Stop when walkInfo is provided", async () => {
    const onNext = vi.fn();
    const onStop = vi.fn();
    render(
      <HelpPanel
        surface="editor"
        draft={EMPTY_DRAFT}
        history={[]}
        onUpdateHistory={() => {}}
        onClose={() => {}}
        walkInfo={{ index: 1, total: 3, onNext, onStop }}
      />,
    );
    expect(screen.getByText(/walk 2\/3/i)).toBeInTheDocument(); // index is 0-based, display is 1-based
    await userEvent.click(screen.getByRole("button", { name: /next task/i }));
    expect(onNext).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: /stop walk/i }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("disables Next task on the last item", () => {
    render(
      <HelpPanel
        surface="editor"
        draft={EMPTY_DRAFT}
        history={[]}
        onUpdateHistory={() => {}}
        onClose={() => {}}
        walkInfo={{ index: 2, total: 3, onNext: () => {}, onStop: () => {} }}
      />,
    );
    expect(screen.getByRole("button", { name: /next task/i })).toBeDisabled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm test tests/components/HelpPanel.test.tsx
```

Expected: FAIL — `walkInfo` prop unknown to HelpPanel; `Walk 2/3` not in document.

- [ ] **Step 4: Add `walkInfo` to HelpPanel**

In `components/HelpPanel.tsx`:

1. Extend the `Props` type (line ~14) — add:

```ts
  walkInfo?: { index: number; total: number; onNext: () => void; onStop: () => void };
```

2. Destructure it in the component signature (line ~41):

```ts
export function HelpPanel({
  surface,
  draft,
  diagrams,
  history,
  onUpdateHistory,
  onClose,
  pendingEditCount = 0,
  onOpenReview,
  walkInfo,
}: Props) {
```

3. Inside the `<header>` block, just before the `<Button variant="ghost" size="sm" onClick={onClose}>Close</Button>` line, insert:

```tsx
          {walkInfo && (
            <>
              <span className="text-hig-footnote font-medium text-ink-secondary">
                Walk {walkInfo.index + 1}/{walkInfo.total}
              </span>
              <Button
                size="sm"
                onClick={walkInfo.onNext}
                disabled={walkInfo.index >= walkInfo.total - 1}
              >
                Next task
              </Button>
              <Button size="sm" variant="secondary" onClick={walkInfo.onStop}>
                Stop walk
              </Button>
            </>
          )}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test tests/components/HelpPanel.test.tsx
```

Expected: PASS (3/3).

- [ ] **Step 6: Commit**

```bash
git add components/HelpPanel.tsx tests/components/HelpPanel.test.tsx
git commit -m "feat(AI-36): HelpPanel walkInfo prop for sequential task walks

Optional walkInfo={ index, total, onNext, onStop } adds a 'Walk N/M' chip
and Next task + Stop walk buttons to the panel header. Next is disabled
on the last item. Panel behaviour without the prop is unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Editor footer — add Clear button

**Files:**
- Modify: `components/Editor.tsx:30-41, 278-297`
- Modify: `tests/components/Editor.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `tests/components/Editor.test.tsx`:

```tsx
it("renders a Clear button when onClear is provided and fires after confirm", async () => {
  const onClear = vi.fn();
  render(
    <Editor namespace="standalone:test:editor-clear" onFinalize={() => {}} onClear={onClear} />,
  );
  await userEvent.click(screen.getByRole("button", { name: /^clear$/i }));
  await userEvent.click(screen.getByRole("button", { name: /^yes$/i }));
  expect(onClear).toHaveBeenCalledTimes(1);
});

it("does not render Clear when onClear is omitted", () => {
  render(<Editor namespace="standalone:test:editor-no-clear" onFinalize={() => {}} />);
  expect(screen.queryByRole("button", { name: /^clear$/i })).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/components/Editor.test.tsx -t "Clear"
```

Expected: FAIL — the Clear button doesn't exist yet.

- [ ] **Step 3: Add `onClear` to Editor**

In `components/Editor.tsx`:

1. Add the prop to the `Props` type (around line 30):

```ts
type Props = {
  namespace: string;
  onFinalize: (draft: Draft) => void;
  disabled?: boolean;
  onHelp?: () => void;
  onClear?: () => void;
  mode?: "single" | "epic";
  onKnead?: (draft: Draft) => void;
  kneadDisabled?: boolean;
  onDraftChange?: (draft: Draft) => void;
  hideSubmit?: boolean;
};
```

2. Destructure `onClear` in the function signature (around line 53):

```ts
export function Editor({
  namespace, onFinalize, disabled = false, onHelp, onClear,
  mode = "single", onKnead, kneadDisabled = false, onDraftChange,
  hideSubmit = false,
}: Props) {
```

3. Add the import at the top:

```ts
import { ClearDraftButton } from "@/components/ClearDraftButton";
```

4. In the footer block (around line 278–297), add the Clear button between Help and the primary submit:

```tsx
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-rule">
        {onHelp && (
          <Button type="button" variant="ghost" onClick={onHelp}>
            Help
          </Button>
        )}
        {onClear && <ClearDraftButton onConfirm={onClear} />}
        {!hideSubmit && (mode === "epic" ? (
          <Button
            type="submit"
            size="lg"
            disabled={kneadDisabled || !hasEpicDescription(draft.description)}
          >
            Knead tasks
          </Button>
        ) : (
          <Button type="submit" size="lg" disabled={disabled || !draft.title.trim()}>
            Finalize task
          </Button>
        ))}
      </div>
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test tests/components/Editor.test.tsx
```

Expected: PASS for the new tests; existing tests unaffected.

- [ ] **Step 5: Commit**

```bash
git add components/Editor.tsx tests/components/Editor.test.tsx
git commit -m "feat(AI-36): Editor exposes optional Clear button in footer

When onClear is provided, render ClearDraftButton between Help and the
primary submit. Inline confirm protects against stray clicks; the parent
decides what 'clear' means for the current namespace.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: StandaloneApp — `clearVisibleDraft` handler

**Files:**
- Modify: `components/StandaloneApp.tsx` (around the `onAdd` / handler block + the Editor render call)
- Modify: `tests/components/StandaloneApp.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `tests/components/StandaloneApp.test.tsx` (use the existing test scaffolding for the file — read it first if needed):

```tsx
it("Clear in single mode resets only the standalone draft", async () => {
  // Seed a non-empty draft so the Clear button's effect is observable.
  window.localStorage.setItem(
    "task-creator:draft:standalone",
    JSON.stringify({ ...EMPTY_DRAFT, title: "Keep me", description: "<p>hi</p>" }),
  );
  render(<StandaloneApp initialSession={{ configured: false, connected: false }} />);

  // Wait for the title to hydrate, then click Clear.
  await screen.findByDisplayValue("Keep me");
  await userEvent.click(screen.getByRole("button", { name: /^clear$/i }));
  await userEvent.click(screen.getByRole("button", { name: /^yes$/i }));

  // Title is cleared in the UI and in localStorage.
  expect(screen.queryByDisplayValue("Keep me")).toBeNull();
  const stored = JSON.parse(window.localStorage.getItem("task-creator:draft:standalone")!);
  expect(stored.title).toBe("");
});
```

Make sure `EMPTY_DRAFT` is imported from `@/lib/draft/autosave` at the top of the test file.

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/components/StandaloneApp.test.tsx -t "Clear in single mode"
```

Expected: FAIL — `Clear` button not present yet (Editor isn't wired with `onClear`).

- [ ] **Step 3: Add `clearVisibleDraft` to StandaloneApp**

In `components/StandaloneApp.tsx`, near the existing `addTask` / `deleteTask` block (around line 152), add:

```ts
  function clearVisibleDraft() {
    // Decide which namespace the visible Editor is pointed at.
    // Single mode OR Epic tab → the main standalone namespace.
    // Epic sub-task tab → that task's per-task namespace.
    const ns =
      epicMode && epicTasks.length > 0 && activeTab !== "epic"
        ? epicTaskNamespace(activeTab)
        : NAMESPACE;

    if (ns === NAMESPACE) {
      const existing = loadDraft(NAMESPACE);
      // Preserve epic-mode metadata (mode/knead/epicTasks/reviewing/reviews/chatHistory)
      // so clearing the visible draft doesn't blow away surrounding state.
      saveDraft(NAMESPACE, {
        ...EMPTY_DRAFT,
        mode: existing.mode,
        knead: existing.knead,
        epicTasks: existing.epicTasks,
        reviewing: existing.reviewing,
        reviews: existing.reviews,
        chatHistory: existing.chatHistory,
      });
      setLiveDraft(loadDraft(NAMESPACE));
    } else {
      saveDraft(ns, { ...EMPTY_DRAFT });
      // Mirror the cleared title back into the descriptor so the tab label updates.
      setEpicTasks((prev) => {
        const next = setTitle(prev, activeTab, "");
        persistEpicTasks(next);
        return next;
      });
    }
    // Force the Editor to re-hydrate from the just-cleared namespace.
    setTaskRefreshKey((k) => k + 1);
  }
```

Then pass it into the single-mode / Epic-tab Editor render (around line 832):

```tsx
              <Editor
                namespace={NAMESPACE}
                onFinalize={submit}
                disabled={mode.kind === "running"}
                onHelp={() => setHelpOpen("editor")}
                onClear={clearVisibleDraft}
                mode={epicMode ? "epic" : "single"}
                onKnead={startKneading}
                kneadDisabled={kneadLoading}
                onDraftChange={setLiveDraft}
              />
```

The Epic-tab Editor renders inside `EpicTabs` (a sibling tree) — we will plumb `onClear` to it in Task 11. The sub-task `EpicTaskEditor`'s embedded Editor receives it in Task 10.

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test tests/components/StandaloneApp.test.tsx -t "Clear in single mode"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/StandaloneApp.tsx tests/components/StandaloneApp.test.tsx
git commit -m "feat(AI-36): clearVisibleDraft handler in StandaloneApp

Wires the single-mode Editor's onClear to a namespace-aware clear:
- Single OR Epic-tab → reset standalone draft, preserve mode/knead/
  epicTasks/reviewing/reviews/chatHistory metadata.
- Sub-task tab path is plumbed in subsequent tasks (EpicTaskEditor,
  EpicTabs Epic-tab Editor).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: StandaloneApp — analyze-walk state + handlers

**Files:**
- Modify: `components/StandaloneApp.tsx`

- [ ] **Step 1: Add the state**

Just after the existing `tasksAnalyzing` / `tasksAnalyzeProgress` / `taskRefreshKey` block in `StandaloneApp` (around line 95–97), add:

```ts
  // Per-task Help chat threads (one HelpMessage[] per epic task id). Hydrated
  // from each per-task draft's chatHistory on mount.
  const [analyzeChatById, setAnalyzeChatById] = useState<Record<string, HelpMessage[]>>({});
  const [analyzeTaskId, setAnalyzeTaskId] = useState<string | null>(null);
  const [walking, setWalking] = useState(false);
```

Add the `HelpMessage` import at the top of the file (it's already imported as part of the `lib/jobs/types` group on line 33–40 — confirm it's in the list).

- [ ] **Step 2: Hydrate per-task chat threads on mount**

Extend the existing mount-time hydration effect (around lines 118–127):

```ts
  useEffect(() => {
    const d = loadDraft(NAMESPACE);
    setEpicMode(d.mode === "epic");
    if (d.knead) setKnead(d.knead);
    if (d.epicTasks) {
      setEpicTasks(d.epicTasks);
      // Hydrate each task's chatHistory into analyzeChatById.
      const map: Record<string, HelpMessage[]> = {};
      for (const t of d.epicTasks) {
        const taskDraft = loadDraft(epicTaskNamespace(t.id));
        if (taskDraft.chatHistory && taskDraft.chatHistory.length > 0) {
          map[t.id] = taskDraft.chatHistory;
        }
      }
      setAnalyzeChatById(map);
    }
    if (d.reviewing) setReviewing(true);
    if (d.reviews) setReviews(d.reviews);
    setLiveDraft(d);
  }, []);
```

- [ ] **Step 3: Add the walk handlers**

After `clearVisibleDraft` (added in Task 8), add:

```ts
  function openAnalyzeForTask(taskId: string) {
    // Explicit single-task analyze — silently exits any active walk.
    setWalking(false);
    setAnalyzeTaskId(taskId);
    if (taskId !== activeTab) setActiveTab(taskId);
  }

  function startAnalyzeWalk() {
    if (epicTasks.length === 0) return;
    setWalking(true);
    setAnalyzeTaskId(epicTasks[0].id);
    setActiveTab(epicTasks[0].id);
  }

  function advanceWalk() {
    if (!walking || !analyzeTaskId) return;
    const i = epicTasks.findIndex((t) => t.id === analyzeTaskId);
    const next = epicTasks[i + 1];
    if (!next) { stopWalk(); return; }
    setAnalyzeTaskId(next.id);
    setActiveTab(next.id);
  }

  function stopWalk() {
    setWalking(false);
    setAnalyzeTaskId(null);
  }

  function updateAnalyzeChat(taskId: string, next: HelpMessage[]) {
    setAnalyzeChatById((prev) => ({ ...prev, [taskId]: next }));
    // Persist into the per-task draft so it survives reload.
    const ns = epicTaskNamespace(taskId);
    const existing = loadDraft(ns);
    saveDraft(ns, { ...existing, chatHistory: next });
  }
```

- [ ] **Step 4: Prune chat threads on task delete / re-knead / generate**

In `deleteTask` (around line 159–166), add the prune line:

```ts
  function deleteTask(id: string) {
    clearDraft(epicTaskNamespace(id));
    const next = deleteEpicTask(epicTasks, id);
    commitEpicTasks(next);
    setReviews((prev) => { const m = { ...prev }; delete m[id]; persistReview(reviewing, m); return m; });
    setInterference((prev) => { const m = { ...prev }; delete m[id]; return m; });
    setAnalyzeChatById((prev) => { const m = { ...prev }; delete m[id]; return m; });
    if (analyzeTaskId === id) { setAnalyzeTaskId(null); setWalking(false); }
    if (activeTab === id) setActiveTab(next[0]?.id ?? "epic");
  }
```

In `confirmReKnead` (around line 566), reset the analyze map:

```ts
    setAnalyzeChatById({});
    setAnalyzeTaskId(null);
    setWalking(false);
```

In `generateSubtasks` (around line 611, after `commitEpicTasks(descriptors)`), reset it as well:

```ts
    setAnalyzeChatById({});
    setAnalyzeTaskId(null);
    setWalking(false);
```

In `reviewDelete` (around line 258), mirror the prune:

```ts
    setAnalyzeChatById((prev) => { const m = { ...prev }; delete m[id]; return m; });
    if (analyzeTaskId === id) { setAnalyzeTaskId(null); setWalking(false); }
```

- [ ] **Step 5: Remove the old silent batch handler**

Delete the entire `analyzeAll` function (around lines 629–662) and remove the now-unused `tasksAnalyzing` / `tasksAnalyzeProgress` state declarations (lines 95–96). `taskRefreshKey` stays — it's still passed into EpicTabs / ReviewerMode for downstream re-mount needs.

Replace any remaining `onAnalyzeAll={analyzeAll}` prop pass with `onAnalyzeAll={startAnalyzeWalk}` in the `EpicTabs` JSX (around line 816).

Remove `analyzing={tasksAnalyzing}` and `analyzeProgress={tasksAnalyzeProgress}` from the EpicTabs JSX prop list (those props will be dropped in Task 11; pass `false` and `null` here as a temporary bridge if Task 11 hasn't landed yet — but since this plan runs sequentially you can leave the prop drops to Task 11).

For now, replace those props with:

```tsx
                analyzing={false}
                analyzeProgress={null}
```

- [ ] **Step 6: Typecheck**

```bash
pnpm typecheck
```

Expected: TYPECHECK_OK.

- [ ] **Step 7: Run the existing suite to confirm no regressions**

```bash
pnpm test
```

Expected: PASS (one batch-analyze integration test may need an update — if so, remove or rewrite it to call `startAnalyzeWalk` and verify it sets `analyzeTaskId = epicTasks[0].id`). Surface any failures and fix them inline within this task before committing.

- [ ] **Step 8: Commit**

```bash
git add components/StandaloneApp.tsx tests/components/StandaloneApp.test.tsx
git commit -m "feat(AI-36): analyze-walk state machine in StandaloneApp

Replaces the silent batch refine with a sequential walk:
- analyzeChatById: per-task HelpMessage threads, hydrated from each
  per-task draft's chatHistory and persisted back on update.
- analyzeTaskId + walking: pointer to the task whose Help chat is shown
  on the right, plus whether a sequential walk is in progress.
- Handlers: openAnalyzeForTask (explicit single), startAnalyzeWalk,
  advanceWalk (Next task), stopWalk (Stop walk / Close at end).
- Prune analyzeChatById entries on task delete, re-knead, generate,
  and reviewer delete.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: EpicTaskEditor — Analyze this task + per-task Clear

**Files:**
- Modify: `components/epic/EpicTaskEditor.tsx`
- Modify: `tests/components/epic/EpicTaskEditor.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `tests/components/epic/EpicTaskEditor.test.tsx` (or create it if missing — read its current state first):

```tsx
it("renders Analyze this task and fires onAnalyze with the task id", async () => {
  const onAnalyze = vi.fn();
  render(
    <EpicTaskEditor
      taskId="t1"
      allTasks={[{ id: "t1", title: "T1", labels: [], blocks: [], blockedBy: [] }]}
      labels={[]}
      blocks={[]}
      blockedBy={[]}
      refreshKey={0}
      onTitleChange={() => {}}
      onSetLabels={() => {}}
      onAddLink={() => {}}
      onRemoveLink={() => {}}
      onDelete={() => {}}
      onAnalyze={onAnalyze}
      onClear={() => {}}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: /analyze this task/i }));
  expect(onAnalyze).toHaveBeenCalledWith();
});

it("forwards onClear into the embedded Editor footer", async () => {
  const onClear = vi.fn();
  render(
    <EpicTaskEditor
      taskId="t1"
      allTasks={[{ id: "t1", title: "T1", labels: [], blocks: [], blockedBy: [] }]}
      labels={[]}
      blocks={[]}
      blockedBy={[]}
      refreshKey={0}
      onTitleChange={() => {}}
      onSetLabels={() => {}}
      onAddLink={() => {}}
      onRemoveLink={() => {}}
      onDelete={() => {}}
      onAnalyze={() => {}}
      onClear={onClear}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: /^clear$/i }));
  await userEvent.click(screen.getByRole("button", { name: /^yes$/i }));
  expect(onClear).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/components/epic/EpicTaskEditor.test.tsx
```

Expected: FAIL — `onAnalyze` / `onClear` props unknown; buttons absent.

- [ ] **Step 3: Update EpicTaskEditor**

Replace the entire `components/epic/EpicTaskEditor.tsx`:

```tsx
"use client";

import { Editor } from "@/components/Editor";
import { Button } from "@/components/ui/Button";
import { LabelsEditor } from "@/components/epic/LabelsEditor";
import { SubtaskLinksField } from "@/components/epic/SubtaskLinksField";
import { epicTaskNamespace, type EpicTask } from "@/lib/epic/tasks";
import type { SubTask } from "@/lib/subtasks/types";

type Props = {
  taskId: string;
  allTasks: EpicTask[];
  labels: string[];
  blocks: string[];
  blockedBy: string[];
  refreshKey: number;
  onTitleChange: (title: string) => void;
  onSetLabels: (labels: string[]) => void;
  onAddLink: (blockerId: string, blockedId: string) => void;
  onRemoveLink: (blockerId: string, blockedId: string) => void;
  onDelete: () => void;
  onAnalyze: () => void;
  onClear: () => void;
};

export function EpicTaskEditor({
  taskId, allTasks, labels, blocks, blockedBy, refreshKey,
  onTitleChange, onSetLabels, onAddLink, onRemoveLink, onDelete,
  onAnalyze, onClear,
}: Props) {
  const self: SubTask = { id: taskId, title: "", description: "", labels, blocks, blockedBy };
  const allAsSubtasks: SubTask[] = allTasks.map((t) => ({ id: t.id, title: t.title, description: "", labels: t.labels, blocks: t.blocks, blockedBy: t.blockedBy }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <Button type="button" variant="secondary" size="sm" onClick={onAnalyze}>
          Analyze this task
        </Button>
        <Button type="button" variant="ghost" size="sm" aria-label="Delete task" onClick={onDelete}>
          Delete task
        </Button>
      </div>
      <Editor
        key={`${taskId}:${refreshKey}`}
        namespace={epicTaskNamespace(taskId)}
        onFinalize={() => {}}
        hideSubmit
        onClear={onClear}
        onDraftChange={(d) => onTitleChange(d.title)}
      />
      <div className="hig-card p-4 flex flex-col gap-3">
        <h3 className="hig-section-label">Dependencies &amp; labels</h3>
        <LabelsEditor value={labels} onChange={onSetLabels} />
        <SubtaskLinksField subtask={self} allSubtasks={allAsSubtasks} onAddLink={onAddLink} onRemoveLink={onRemoveLink} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test tests/components/epic/EpicTaskEditor.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/epic/EpicTaskEditor.tsx tests/components/epic/EpicTaskEditor.test.tsx
git commit -m "feat(AI-36): EpicTaskEditor exposes Analyze + Clear

Adds two required props:
- onAnalyze: fired by 'Analyze this task' button in the header strip
  next to Delete task. Parent will open the per-task Help chat.
- onClear: forwarded into the embedded Editor's footer ClearDraftButton
  so the user can wipe just the visible per-task draft.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: EpicTabs — new toolbar (Analyze all walk + per-tab Analyze + Back to kneading)

**Files:**
- Modify: `components/epic/EpicTabs.tsx`
- Modify: `tests/components/epic/EpicTabs.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `tests/components/epic/EpicTabs.test.tsx`:

```tsx
it("Analyze all fires onAnalyzeAll (walk starter)", async () => {
  const onAnalyzeAll = vi.fn();
  render(
    <EpicTabs
      tasks={[{ id: "t1", title: "T1", labels: [], blocks: [], blockedBy: [] }]}
      active="t1"
      refreshKey={0}
      onSelect={() => {}}
      onAdd={() => {}}
      onAnalyzeAll={onAnalyzeAll}
      onAnalyzeTask={() => {}}
      onBake={() => {}}
      onBack={() => {}}
      onTitleChange={() => {}}
      onSetLabels={() => {}}
      onAddLink={() => {}}
      onRemoveLink={() => {}}
      onDelete={() => {}}
      onClearTask={() => {}}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: /^analyze all$/i }));
  expect(onAnalyzeAll).toHaveBeenCalledTimes(1);
});

it("Back to kneading fires onBack after confirm", async () => {
  const onBack = vi.fn();
  render(
    <EpicTabs
      tasks={[{ id: "t1", title: "T1", labels: [], blocks: [], blockedBy: [] }]}
      active="t1"
      refreshKey={0}
      onSelect={() => {}}
      onAdd={() => {}}
      onAnalyzeAll={() => {}}
      onAnalyzeTask={() => {}}
      onBake={() => {}}
      onBack={onBack}
      onTitleChange={() => {}}
      onSetLabels={() => {}}
      onAddLink={() => {}}
      onRemoveLink={() => {}}
      onDelete={() => {}}
      onClearTask={() => {}}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: /back to kneading/i }));
  await userEvent.click(screen.getByRole("button", { name: /^yes$/i }));
  expect(onBack).toHaveBeenCalledTimes(1);
});

it("active sub-task tab forwards onClearTask + onAnalyzeTask with the right id", async () => {
  const onAnalyzeTask = vi.fn();
  render(
    <EpicTabs
      tasks={[{ id: "t1", title: "T1", labels: [], blocks: [], blockedBy: [] }]}
      active="t1"
      refreshKey={0}
      onSelect={() => {}}
      onAdd={() => {}}
      onAnalyzeAll={() => {}}
      onAnalyzeTask={onAnalyzeTask}
      onBake={() => {}}
      onBack={() => {}}
      onTitleChange={() => {}}
      onSetLabels={() => {}}
      onAddLink={() => {}}
      onRemoveLink={() => {}}
      onDelete={() => {}}
      onClearTask={() => {}}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: /analyze this task/i }));
  expect(onAnalyzeTask).toHaveBeenCalledWith("t1");
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/components/epic/EpicTabs.test.tsx
```

Expected: FAIL — new props (`onAnalyzeTask`, `onBack`, `onClearTask`) unknown; `analyzing` / `analyzeProgress` not passed in test but currently required.

- [ ] **Step 3: Rewrite EpicTabs**

Replace `components/epic/EpicTabs.tsx`:

```tsx
"use client";

import { Editor } from "@/components/Editor";
import { Button } from "@/components/ui/Button";
import { EpicTabBar } from "@/components/epic/EpicTabBar";
import { EpicTaskEditor } from "@/components/epic/EpicTaskEditor";
import { BackBar } from "@/components/epic/BackBar";
import type { EpicTask } from "@/lib/epic/tasks";

const NAMESPACE = "standalone";

type Props = {
  tasks: EpicTask[];
  active: "epic" | string;
  refreshKey: number;
  onSelect: (tab: "epic" | string) => void;
  onAdd: () => void;
  onAnalyzeAll: () => void;
  onAnalyzeTask: (taskId: string) => void;
  onBake: () => void;
  onBack: () => void;
  onTitleChange: (id: string, title: string) => void;
  onSetLabels: (id: string, labels: string[]) => void;
  onAddLink: (blockerId: string, blockedId: string) => void;
  onRemoveLink: (blockerId: string, blockedId: string) => void;
  onDelete: (id: string) => void;
  onClearTask: (id: string) => void;
};

export function EpicTabs(props: Props) {
  const activeTask = props.active === "epic" ? null : props.tasks.find((t) => t.id === props.active) ?? null;

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <BackBar
        label="Back to kneading"
        confirmMessage="This will clear the current sub-tasks and per-task drafts."
        onBack={props.onBack}
      />

      <EpicTabBar
        tasks={props.tasks.map((t) => ({ id: t.id, title: t.title }))}
        active={props.active}
        onSelect={props.onSelect}
        onAdd={props.onAdd}
      />

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={props.onAnalyzeAll} disabled={props.tasks.length === 0}>
          Analyze all
        </Button>
        <Button type="button" size="sm" onClick={props.onBake} disabled={props.tasks.length === 0}>
          Bake
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTask ? (
          <EpicTaskEditor
            taskId={activeTask.id}
            allTasks={props.tasks}
            labels={activeTask.labels}
            blocks={activeTask.blocks}
            blockedBy={activeTask.blockedBy}
            refreshKey={props.refreshKey}
            onTitleChange={(title) => props.onTitleChange(activeTask.id, title)}
            onSetLabels={(labels) => props.onSetLabels(activeTask.id, labels)}
            onAddLink={props.onAddLink}
            onRemoveLink={props.onRemoveLink}
            onDelete={() => props.onDelete(activeTask.id)}
            onAnalyze={() => props.onAnalyzeTask(activeTask.id)}
            onClear={() => props.onClearTask(activeTask.id)}
          />
        ) : (
          // Epic tab — edit the epic/main task itself; Clear targets the standalone draft.
          <Editor
            key={`epic:${props.refreshKey}`}
            namespace={NAMESPACE}
            onFinalize={() => {}}
            hideSubmit
            onClear={() => props.onClearTask("epic")}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire StandaloneApp to the new props**

In `components/StandaloneApp.tsx`, find the `EpicTabs` JSX (the props placeholder pass from Task 9). Replace with:

```tsx
              <EpicTabs
                tasks={epicTasks}
                active={activeTab}
                refreshKey={taskRefreshKey}
                onSelect={setActiveTab}
                onAdd={addTask}
                onAnalyzeAll={startAnalyzeWalk}
                onAnalyzeTask={openAnalyzeForTask}
                onBake={bake}
                onBack={() => confirmReKnead(false)}
                onTitleChange={taskTitleChange}
                onSetLabels={taskSetLabels}
                onAddLink={taskAddLink}
                onRemoveLink={taskRemoveLink}
                onDelete={deleteTask}
                onClearTask={(id) => {
                  if (id === "epic") {
                    clearVisibleDraft(); // Epic-tab path → standalone draft
                  } else {
                    saveDraft(epicTaskNamespace(id), { ...EMPTY_DRAFT });
                    setEpicTasks((prev) => {
                      const next = setTitle(prev, id, "");
                      persistEpicTasks(next);
                      return next;
                    });
                    setTaskRefreshKey((k) => k + 1);
                  }
                }}
              />
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm test tests/components/epic/EpicTabs.test.tsx
pnpm typecheck
```

Expected: PASS + TYPECHECK_OK.

- [ ] **Step 6: Commit**

```bash
git add components/epic/EpicTabs.tsx components/StandaloneApp.tsx tests/components/epic/EpicTabs.test.tsx
git commit -m "feat(AI-36): EpicTabs toolbar with walk, per-tab analyze, Back

Toolbar reshape:
- 'Analyze all' now starts a sequential Help-chat walk (handled by
  StandaloneApp.startAnalyzeWalk).
- New 'Analyze this task' inside EpicTaskEditor routes through
  onAnalyzeTask(id) -> openAnalyzeForTask in the parent.
- New BackBar 'Back to kneading' with confirm triggers
  confirmReKnead(false), reusing existing reset semantics.
- Drops the silent batch 'Analyzing N/M…' progress chip.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Mount per-task Help walk panel in StandaloneApp

**Files:**
- Modify: `components/StandaloneApp.tsx`

- [ ] **Step 1: Add the right-side analyze panel**

In `components/StandaloneApp.tsx`, just below the existing KneadingPanel mount block (around line 931–947), add:

```tsx
      {analyzeTaskId && (() => {
        const taskDraft = loadDraft(epicTaskNamespace(analyzeTaskId));
        const idx = epicTasks.findIndex((t) => t.id === analyzeTaskId);
        return (
          <HelpPanel
            surface="editor"
            draft={taskDraft}
            history={analyzeChatById[analyzeTaskId] ?? []}
            onUpdateHistory={(next) => updateAnalyzeChat(analyzeTaskId, next)}
            onClose={() => {
              if (walking) stopWalk();
              else setAnalyzeTaskId(null);
            }}
            pendingEditCount={pendingEdits.length}
            onOpenReview={() => setReviewOpen(true)}
            walkInfo={walking && idx >= 0 ? { index: idx, total: epicTasks.length, onNext: advanceWalk, onStop: stopWalk } : undefined}
          />
        );
      })()}
```

Add the `HelpPanel` import at the top if not already present (it's already imported at line 23 — confirm).

- [ ] **Step 2: Enforce panel mutual exclusion**

The existing `helpOpen` panel block and the new `analyzeTaskId` block are now both gated on truthiness; if both are set, both would render. Add a guard: when the user opens the analyze panel, close the editor Help; when the user opens editor Help while analyze is active, close analyze. Insert into `openAnalyzeForTask`:

```ts
  function openAnalyzeForTask(taskId: string) {
    setWalking(false);
    setHelpOpen(null);                 // close editor Help if open
    setAnalyzeTaskId(taskId);
    if (taskId !== activeTab) setActiveTab(taskId);
  }
```

And into `startAnalyzeWalk`:

```ts
  function startAnalyzeWalk() {
    if (epicTasks.length === 0) return;
    setHelpOpen(null);
    setWalking(true);
    setAnalyzeTaskId(epicTasks[0].id);
    setActiveTab(epicTasks[0].id);
  }
```

And into the existing single-mode Help open path (`setHelpOpen("editor")`): wrap the existing call into a small handler that also closes analyze. Edit the Editor's `onHelp` prop in `components/StandaloneApp.tsx`:

```tsx
                onHelp={() => { setAnalyzeTaskId(null); setWalking(false); setHelpOpen("editor"); }}
```

- [ ] **Step 3: Manual smoke + typecheck**

```bash
pnpm typecheck
pnpm test
```

Expected: TYPECHECK_OK, suite green.

- [ ] **Step 4: Commit**

```bash
git add components/StandaloneApp.tsx
git commit -m "feat(AI-36): mount per-task HelpPanel for analyze walk

When analyzeTaskId is set, render HelpPanel on the right pointed at the
per-task draft (loaded fresh each render so applied edits propagate).
walkInfo is passed only while walking so 'Walk N/M' + Next + Stop appear
during a sequential walk. The editor Help and analyze panels are mutually
exclusive — opening one closes the other.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Kneading-phase BackBar (← Back to editor)

**Files:**
- Modify: `components/StandaloneApp.tsx`

- [ ] **Step 1: Mount the BackBar above the KneadingPanel**

The KneadingPanel is rendered as a right-side `<aside>` (lines 931–947). The Editor below it stays mounted in the left column. The BackBar belongs at the top of the left column above the Editor, visible only while `knead.status !== "idle"`.

In the left-column render block (around lines 825–859), insert just before the `<Editor … />`:

```tsx
            {epicMode && knead.status !== "idle" && (
              <BackBar
                label="Back to editor"
                confirmMessage="Discard kneading rounds and return to the editor?"
                onBack={() => {
                  setKnead(EMPTY_KNEAD);
                  persistEpic(true, EMPTY_KNEAD);
                  setCapPrompt(null);
                  setKneadError(null);
                }}
              />
            )}
```

Add the `BackBar` import:

```ts
import { BackBar } from "@/components/epic/BackBar";
```

`EMPTY_KNEAD` is already imported from `@/lib/knead/types` (line 20).

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: TYPECHECK_OK.

- [ ] **Step 3: Add an integration test**

Append to `tests/components/StandaloneApp.test.tsx`:

```tsx
it("Back to editor from kneading clears knead state and hides the panel", async () => {
  window.localStorage.setItem(
    "task-creator:draft:standalone",
    JSON.stringify({
      ...EMPTY_DRAFT,
      mode: "epic",
      description: "<p>An epic</p>",
      knead: {
        status: "interviewing",
        rounds: [{
          questions: [{ id: "q-a", prompt: "?", section: "business", type: "text" }],
          answers: {},
          skipped: [],
        }],
        sourceDescription: "An epic",
      },
    }),
  );
  render(<StandaloneApp initialSession={{ configured: false, connected: false }} />);

  await screen.findByRole("button", { name: /back to editor/i });
  await userEvent.click(screen.getByRole("button", { name: /back to editor/i }));
  await userEvent.click(screen.getByRole("button", { name: /^yes$/i }));

  expect(screen.queryByRole("button", { name: /back to editor/i })).toBeNull();
  const stored = JSON.parse(window.localStorage.getItem("task-creator:draft:standalone")!);
  expect(stored.knead.status).toBe("idle");
  expect(stored.knead.rounds).toEqual([]);
});
```

- [ ] **Step 4: Run test**

```bash
pnpm test tests/components/StandaloneApp.test.tsx -t "Back to editor"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/StandaloneApp.tsx tests/components/StandaloneApp.test.tsx
git commit -m "feat(AI-36): BackBar above the Editor during kneading

While the kneading interview is active, surface a '← Back to editor'
button at the top of the left column. Confirming resets knead state to
EMPTY_KNEAD, clears any cap prompt + error, and returns the user to the
plain epic editor with description intact.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Reviewer mode — relabel Edit tasks → ← Back to tabs

**Files:**
- Modify: `components/epic/review/ReviewerMode.tsx:48-52`
- Modify: `tests/components/epic/review/ReviewerMode.test.tsx` (if it exists; otherwise add an inline assertion to the closest existing test)

- [ ] **Step 1: Write the failing assertion**

In whichever test file exercises `ReviewerMode` (search for `from "@/components/epic/review/ReviewerMode"` in `tests/`), add:

```tsx
it("shows '← Back to tabs' instead of 'Edit tasks'", () => {
  render(
    <ReviewerMode
      epicTitle="E"
      epicDescriptionHtml=""
      tasks={[]}
      reviews={{}}
      interference={{}}
      selectedId={null}
      refreshKey={0}
      onSelect={() => {}}
      onEditTasks={() => {}}
      onTitleChange={() => {}}
      onSetLabels={() => {}}
      onAddLink={() => {}}
      onRemoveLink={() => {}}
      onReviewChange={() => {}}
      onDelete={() => {}}
    />,
  );
  expect(screen.getByRole("button", { name: /back to tabs/i })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^edit tasks$/i })).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/components/epic/review/ReviewerMode.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Relabel the button**

In `components/epic/review/ReviewerMode.tsx`, replace the `Edit tasks` button (around line 51) with:

```tsx
          <Button type="button" variant="secondary" size="sm" onClick={props.onEditTasks}>← Back to tabs</Button>
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test tests/components/epic/review/ReviewerMode.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/epic/review/ReviewerMode.tsx tests/components/epic/review/ReviewerMode.test.tsx
git commit -m "feat(AI-36): reviewer mode 'Edit tasks' becomes '← Back to tabs'

Aligns the reviewer's exit affordance with the new phase-by-phase Back
language used in EpicTabs and the kneading panel. The handler
(onEditTasks) is unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: Final verification

**Files:** none

- [ ] **Step 1: Run the full suite**

```bash
pnpm test
```

Expected: all tests pass (no skips beyond the pre-existing project-wide skipped e2e).

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: TYPECHECK_OK.

- [ ] **Step 3: Lint**

```bash
pnpm lint
```

Expected: no warnings or errors.

- [ ] **Step 4: Smoke the live app**

```bash
pnpm dev
```

Open the app, switch to **Epic** mode, type a description, click **Knead tasks**. Confirm:
- The kneading panel always shows at least one round of questions (the AI no longer skips straight to "Kneading complete").
- A `← Back to editor` button is visible above the Editor while kneading.
- Answering the round and clicking **Knead** advances; eventually **Generate sub-tasks** is shown.
- After generating, the tabs view shows `← Back to kneading`, **Analyze all**, **Bake**, an **Analyze this task** button per task, a Clear button in each tab's Editor footer.
- **Analyze this task** opens a Help-style chat on the right pointed at that task's draft.
- **Analyze all** switches to task 1 and opens the chat with a `Walk 1/N` chip + Next task + Stop walk buttons.
- **Next task** advances; on the last task, Next is disabled and Close exits the walk.
- ProposedEdits from the chat land in that task's draft (use the existing Review N changes flow).
- **Clear** in each Editor footer wipes only the visible namespace; switching tabs preserves their drafts.
- In reviewer mode, the bottom-left button is **← Back to tabs**.

- [ ] **Step 5: No commit needed**

Verification step only. If anything failed, file the failure as a follow-up task and surface to the user before declaring done.

---

## Self-review checklist (filled by plan author)

- ✅ **Spec coverage:** All three spec themes (forced kneading, analyze walk, clear+back) map to tasks. Forced kneading → Tasks 1–3; Clear/Back → Tasks 4, 5, 7, 8, 11, 13, 14; Analyze walk → Tasks 6, 9, 10, 11, 12. Verification step (Task 15) hits every acceptance criterion in the spec.
- ✅ **No placeholders:** every step has concrete code, file paths, and expected outcomes.
- ✅ **Type consistency:** `walkInfo` shape matches between HelpPanel test, HelpPanel implementation, and StandaloneApp call site. `EpicTabs` prop names (`onAnalyzeAll`, `onAnalyzeTask`, `onBack`, `onClearTask`) match across tests and call site. `EpicTaskEditor` prop additions (`onAnalyze`, `onClear`) match between Task 10 and Task 11. `runKnead` retry shape uses `mustAskFirstRound: boolean` in both skill update (Task 1) and agent (Task 3).
- ✅ **Commit hygiene:** every commit message ends with the `Co-Authored-By` trailer; every commit uses targeted `git add` (never `git add -A` / `git add .`); no commit touches `prompts/types/*`.
