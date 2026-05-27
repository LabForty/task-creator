# Epic Mode SP1 — Mode Entry + Kneading Interview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Single/Epic mode switch and a multi-round, AI-driven "kneading" interview that gathers business + technical context from a free-form epic description, ending at a "Kneading complete" state (sub-task generation is SP2).

**Architecture:** Pure logic (types, JSON parsing, cap rules, state transitions) lives in `lib/knead/` and `lib/epic/` and is unit-tested in isolation. The AI call goes through the existing `lib/agent` transport (`runKnead`) and a synchronous `POST /api/knead` route — *not* the job/SSE pipeline. New React components under `components/epic/` render the interview; `components/Editor.tsx` gains a mode prop and `components/StandaloneApp.tsx` wires it together. The existing `TASK_AGENT_MODE=stub` transport gains a `knead` branch so tests and e2e run offline and deterministically.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod, Tailwind (HIG tokens), `@anthropic-ai/claude-agent-sdk`, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-05-27-epic-mode-kneading-sp1-design.md`

**Conventions to follow:**
- Reuse `components/ui/{Button,SegmentedControl,TextField}`; style only with HIG token classes (`text-hig-*`, `bg-surface*`, `border-rule`, `text-accent`, `text-danger`, `bg-warning-tint`, etc.).
- Tests live under `tests/{lib,components,api}/` and run with `npm test` (vitest). E2E under `e2e/` with `npm run test:e2e`.
- Commit after every task once `npm test` and `npm run typecheck` pass.

---

## File structure

**Create:**
- `lib/knead/types.ts` — shared kneading types + constants.
- `lib/knead/parse.ts` — `parseKneadResponse`, `applyCap`, `KneadQuestionSchema` (pure).
- `lib/epic/state.ts` — pure `KneadState` transition helpers + `isAnswered`.
- `skills/task-knead/SKILL.md` — the kneading system prompt.
- `app/api/knead/route.ts` — synchronous POST endpoint.
- `components/epic/QuestionField.tsx` — renders one question by type.
- `components/epic/CapturedContext.tsx` — read-only left-pane answer mirror.
- `components/epic/KneadingPanel.tsx` — right-pane interview.
- `components/epic/LostDoughWarning.tsx` — re-knead warning + keep-answers checkbox.
- Tests: `tests/lib/knead-parse.test.ts`, `tests/lib/epic-state.test.ts`, `tests/lib/agent-knead.test.ts`, `tests/api/knead.test.ts`, `tests/components/epic/QuestionField.test.tsx`, `tests/components/epic/CapturedContext.test.tsx`, `tests/components/epic/KneadingPanel.test.tsx`, `tests/components/epic/LostDoughWarning.test.tsx`, `tests/components/StandaloneApp.epic.test.tsx`, `e2e/epic-mode.spec.ts`.

**Modify:**
- `lib/draft/autosave.ts` — add `mode` + `knead` to `Draft`, default in `loadDraft`.
- `lib/agent/index.ts` — add `runKnead`; add `knead` branch to `makeStubTransport`.
- `lib/api/schemas.ts` — add `KneadBodySchema`.
- `components/Editor.tsx` — add `mode` / `onKnead` / `kneadDisabled` / `onDraftChange` props.
- `components/StandaloneApp.tsx` — mode switch, kneading orchestration, mirror, lost-dough.

---

## Task 1: Extend the Draft type with epic-mode fields

**Files:**
- Create: `lib/knead/types.ts`
- Modify: `lib/draft/autosave.ts:3-22` (Draft type + EMPTY_DRAFT) and `:27-45` (loadDraft)
- Test: `tests/lib/draft.test.ts` (extend existing)

- [ ] **Step 1: Create the shared kneading types**

Create `lib/knead/types.ts`:

```ts
// Shared kneading types. Pure types + constants only — no SDK, no React, so
// this module is safe to import from both server (lib/agent, routes) and
// client (components) code.

export type KneadAnswerValue = string | string[];

export type KneadQuestionType = "text" | "single" | "multi";
export type KneadSection = "business" | "technical";

export type KneadQuestion = {
  id: string;
  prompt: string;
  section: KneadSection;
  type: KneadQuestionType;
  options?: string[]; // present for "single" / "multi"
};

// One round of the interview plus the user's answers to it. The last round in
// KneadState.rounds is the one currently being answered while interviewing.
export type KneadRound = {
  questions: KneadQuestion[];
  answers: Record<string, KneadAnswerValue>;
};

export type KneadState = {
  status: "idle" | "interviewing" | "complete";
  rounds: KneadRound[];
  // The epic description captured when kneading first started this run. Used
  // to detect a later edit (lost-dough). Undefined until the first round.
  sourceDescription?: string;
};

// Raw, validated shape the model returns (before cap rules are applied).
export type KneadModelResult =
  | { kind: "questions"; questions: KneadQuestion[]; justification?: string }
  | { kind: "complete" };

// What /api/knead returns to the client after cap rules are applied.
export type KneadOutcome =
  | { kind: "questions"; round: { questions: KneadQuestion[] } }
  | { kind: "complete" }
  | { kind: "cap_reached"; justification: string };

export const MAX_QUESTIONS_PER_ROUND = 25;
export const MAX_FREE_ROUNDS = 5;
export const DEFAULT_CAP_JUSTIFICATION =
  "The AI needs more context to produce well-scoped sub-tasks.";

export const EMPTY_KNEAD: KneadState = { status: "idle", rounds: [] };
```

- [ ] **Step 2: Write the failing Draft tests**

Append to `tests/lib/draft.test.ts` (inside the existing `describe`):

```ts
  it("loadDraft defaults mode to 'single' when missing", () => {
    window.localStorage.setItem("task-creator:draft:m1", JSON.stringify({ title: "T" }));
    expect(loadDraft("m1").mode).toBe("single");
  });

  it("loadDraft preserves an epic mode + knead block", () => {
    const knead = { status: "interviewing", rounds: [{ questions: [], answers: {} }] };
    window.localStorage.setItem(
      "task-creator:draft:m2",
      JSON.stringify({ title: "T", description: "D", mode: "epic", knead }),
    );
    const d = loadDraft("m2");
    expect(d.mode).toBe("epic");
    expect(d.knead).toEqual(knead);
  });

  it("loadDraft falls back to 'single' for an unknown mode value", () => {
    window.localStorage.setItem("task-creator:draft:m3", JSON.stringify({ mode: "bogus" }));
    expect(loadDraft("m3").mode).toBe("single");
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- tests/lib/draft.test.ts`
Expected: FAIL — `mode` is `undefined` (property doesn't exist yet).

- [ ] **Step 4: Extend the Draft type and loadDraft**

In `lib/draft/autosave.ts`, change the import line and the `Draft` type:

```ts
import type { Diagrams, HelpMessage } from "@/lib/jobs/types";
import type { KneadState } from "@/lib/knead/types";

export type Draft = {
  title: string;
  description: string;
  acceptanceCriteria: string[];
  constraints: string;
  taskType: string;
  diagrams?: Diagrams;
  chatHistory?: HelpMessage[];
  // Epic-mode extensions. mode defaults to "single" for v1 drafts.
  mode: "single" | "epic";
  knead?: KneadState;
};
```

Update `EMPTY_DRAFT` to include `mode`:

```ts
export const EMPTY_DRAFT: Draft = {
  title: "",
  description: "",
  acceptanceCriteria: [],
  constraints: "",
  taskType: "story",
  mode: "single",
};
```

In `loadDraft`, add `mode` + `knead` to the returned object (inside the `try` return):

```ts
    return {
      title: parsed.title ?? "",
      description: parsed.description ?? "",
      acceptanceCriteria: Array.isArray(parsed.acceptanceCriteria) ? parsed.acceptanceCriteria : [],
      constraints: parsed.constraints ?? "",
      taskType: typeof parsed.taskType === "string" && parsed.taskType.trim() ? parsed.taskType : "story",
      diagrams: parsed.diagrams,
      chatHistory: Array.isArray(parsed.chatHistory) ? parsed.chatHistory : undefined,
      mode: parsed.mode === "epic" ? "epic" : "single",
      knead: parsed.knead,
    };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- tests/lib/draft.test.ts && npm run typecheck`
Expected: PASS. (typecheck confirms no other Draft constructor broke.)

- [ ] **Step 6: Commit**

```bash
git add lib/knead/types.ts lib/draft/autosave.ts tests/lib/draft.test.ts
git commit -m "feat(AI-36): add epic mode + knead state to Draft type"
```

---

## Task 2: Kneading response parsing + cap rules (pure)

**Files:**
- Create: `lib/knead/parse.ts`
- Test: `tests/lib/knead-parse.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/knead-parse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseKneadResponse, applyCap } from "@/lib/knead/parse";

const questionsJson = JSON.stringify({
  kind: "questions",
  questions: [
    { id: "q1", prompt: "Which surfaces?", section: "business", type: "multi", options: ["Web", "API"] },
    { id: "q2", prompt: "Rollout risk?", section: "technical", type: "single", options: ["Low", "High"] },
    { id: "q3", prompt: "Describe the value", section: "business", type: "text" },
  ],
});

describe("parseKneadResponse", () => {
  it("parses a valid questions payload", () => {
    const r = parseKneadResponse(questionsJson);
    expect(r.kind).toBe("questions");
    if (r.kind === "questions") expect(r.questions).toHaveLength(3);
  });

  it("parses a complete payload", () => {
    expect(parseKneadResponse('{"kind":"complete"}')).toEqual({ kind: "complete" });
  });

  it("tolerates markdown fences and surrounding prose", () => {
    const wrapped = "Here you go:\n```json\n" + questionsJson + "\n```";
    expect(parseKneadResponse(wrapped).kind).toBe("questions");
  });

  it("truncates a round to 25 questions", () => {
    const many = {
      kind: "questions",
      questions: Array.from({ length: 40 }, (_, i) => ({
        id: `q${i}`, prompt: `Q${i}`, section: "business", type: "text",
      })),
    };
    const r = parseKneadResponse(JSON.stringify(many));
    if (r.kind === "questions") expect(r.questions).toHaveLength(25);
  });

  it("rejects a single/multi question with no options", () => {
    const bad = JSON.stringify({
      kind: "questions",
      questions: [{ id: "q1", prompt: "Pick", section: "business", type: "single" }],
    });
    expect(() => parseKneadResponse(bad)).toThrow(/options/i);
  });

  it("rejects output with no JSON object", () => {
    expect(() => parseKneadResponse("sorry, no json here")).toThrow(/JSON/i);
  });
});

describe("applyCap", () => {
  const result = { kind: "questions", questions: [{ id: "q1", prompt: "P", section: "business", type: "text" }] } as const;

  it("returns questions for rounds below the cap", () => {
    expect(applyCap(result, 0, false)).toEqual({ kind: "questions", round: { questions: result.questions } });
    expect(applyCap(result, 4, false)).toEqual({ kind: "questions", round: { questions: result.questions } });
  });

  it("returns cap_reached at the 6th round without approval", () => {
    const out = applyCap(result, 5, false);
    expect(out.kind).toBe("cap_reached");
    if (out.kind === "cap_reached") expect(out.justification).toBeTruthy();
  });

  it("uses the model's justification when present", () => {
    const withJust = { ...result, justification: "Auth model still unclear." };
    const out = applyCap(withJust, 5, false);
    if (out.kind === "cap_reached") expect(out.justification).toBe("Auth model still unclear.");
  });

  it("returns questions past the cap once override is approved", () => {
    expect(applyCap(result, 5, true).kind).toBe("questions");
  });

  it("always passes through a complete result", () => {
    expect(applyCap({ kind: "complete" }, 9, false)).toEqual({ kind: "complete" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/lib/knead-parse.test.ts`
Expected: FAIL — `@/lib/knead/parse` does not exist.

- [ ] **Step 3: Implement parse + cap**

Create `lib/knead/parse.ts`:

```ts
import { z } from "zod";
import {
  type KneadModelResult,
  type KneadOutcome,
  MAX_QUESTIONS_PER_ROUND,
  MAX_FREE_ROUNDS,
  DEFAULT_CAP_JUSTIFICATION,
} from "./types";

export const KneadQuestionSchema = z
  .object({
    id: z.string().min(1),
    prompt: z.string().min(1),
    section: z.enum(["business", "technical"]),
    type: z.enum(["text", "single", "multi"]),
    options: z.array(z.string().min(1)).optional(),
  })
  .refine((q) => (q.type === "text" ? !q.options || q.options.length === 0 : (q.options?.length ?? 0) >= 2), {
    message: "single/multi questions need at least 2 options; text questions need none",
    path: ["options"],
  });

const ModelResultSchema = z.union([
  z.object({
    kind: z.literal("questions"),
    questions: z.array(KneadQuestionSchema).min(1),
    justification: z.string().optional(),
  }),
  z.object({ kind: z.literal("complete") }),
]);

// Extract the first balanced top-level JSON object from arbitrary model text.
// Mirrors lib/agent's extractJsonObject so fences/prose are tolerated.
function extractJsonObject(raw: string): string | null {
  const text = raw.trim();
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0, inString = false, escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export function parseKneadResponse(raw: string): KneadModelResult {
  const candidate = extractJsonObject(raw);
  if (!candidate) throw new Error(`knead: model output had no JSON object. First 200 chars: ${raw.slice(0, 200)}`);
  let json: unknown;
  try {
    json = JSON.parse(candidate);
  } catch {
    throw new Error(`knead: model output was not valid JSON. First 200 chars: ${candidate.slice(0, 200)}`);
  }
  const parsed = ModelResultSchema.parse(json);
  if (parsed.kind === "questions") {
    return { ...parsed, questions: parsed.questions.slice(0, MAX_QUESTIONS_PER_ROUND) };
  }
  return parsed;
}

// completedRounds = number of already-answered rounds sent in the request.
// Rounds 1..MAX_FREE_ROUNDS are free; generating round MAX_FREE_ROUNDS+1 needs
// explicit override approval, surfaced as cap_reached.
export function applyCap(
  result: KneadModelResult,
  completedRounds: number,
  overrideApproved: boolean,
): KneadOutcome {
  if (result.kind === "complete") return { kind: "complete" };
  if (completedRounds >= MAX_FREE_ROUNDS && !overrideApproved) {
    return { kind: "cap_reached", justification: result.justification?.trim() || DEFAULT_CAP_JUSTIFICATION };
  }
  return { kind: "questions", round: { questions: result.questions } };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/lib/knead-parse.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/knead/parse.ts tests/lib/knead-parse.test.ts
git commit -m "feat(AI-36): knead response parsing + 5-round cap rules"
```

---

## Task 3: Knead skill prompt + runKnead + stub transport

**Files:**
- Create: `skills/task-knead/SKILL.md`
- Modify: `lib/agent/index.ts` (add `runKnead`; add `knead` branch in `makeStubTransport` near `:471-532`)
- Test: `tests/lib/agent-knead.test.ts`

- [ ] **Step 1: Write the kneading skill prompt**

Create `skills/task-knead/SKILL.md`:

```markdown
---
name: task-knead
description: Interview the author of a software epic to gather business and technical context, one round at a time. Strict JSON output.
---

# Knead Skill

You run a structured interview that turns a free-form epic description into the
context needed to break it into well-scoped sub-tasks. You receive a JSON user
message of this shape:

```json
{
  "epicDescription": "free-form epic text",
  "rounds": [
    {
      "questions": [{ "id": "q1", "prompt": "...", "section": "business", "type": "single", "options": ["A","B"] }],
      "answers": { "q1": "A" }
    }
  ],
  "roundNumber": 2,
  "maxFreeRounds": 5,
  "overrideCapApproved": false
}
```

`rounds` are the rounds already asked and answered. `roundNumber` is the round
you are about to produce. Decide whether you still need more context.

**Output exactly one JSON object** — no markdown, no preamble, no trailing prose.

If you need another round of questions:

```json
{
  "kind": "questions",
  "questions": [
    { "id": "q-surfaces", "prompt": "Which product surfaces are impacted?", "section": "business", "type": "multi", "options": ["Web app", "Admin console", "API", "Mobile"] },
    { "id": "q-value", "prompt": "What user value does this unlock?", "section": "business", "type": "text" },
    { "id": "q-scale", "prompt": "What is the rollout/scalability risk?", "section": "technical", "type": "single", "options": ["Low", "Medium", "High"] }
  ]
}
```

When you have enough context and no further questions:

```json
{ "kind": "complete" }
```

**Rules:**

- Cover both `business` (users, value, surfaces, success metrics, scope) and
  `technical` (data, integrations, scalability, edge cases) dimensions.
- At most **25** questions per round. Ask only what the prior answers leave open.
- Each question needs a stable, unique `id` (kebab-case), a `prompt`, a
  `section` of `business` or `technical`, and a `type`:
  - `text` — open answer, no `options`.
  - `single` — choose one; include 2+ `options`.
  - `multi` — choose any; include 2+ `options`.
- If `roundNumber` is greater than `maxFreeRounds` and `overrideCapApproved` is
  false, and you still need more questions, include a short `justification`
  string on the `questions` object explaining why more context is required.
- Prefer `complete` over padding with low-value questions.
```

- [ ] **Step 2: Write the failing tests**

Create `tests/lib/agent-knead.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { runKnead, makeStubTransport } from "@/lib/agent";
import type { AgentTransport } from "@/lib/agent/types";

function textTransport(text: string): AgentTransport {
  return {
    async runRole({ onEvent }) {
      onEvent({ type: "token", text });
    },
  };
}

describe("runKnead", () => {
  it("returns a questions outcome from a valid model reply", async () => {
    const reply = JSON.stringify({
      kind: "questions",
      questions: [{ id: "q1", prompt: "P", section: "business", type: "text" }],
    });
    const out = await runKnead({ epicDescription: "Epic", rounds: [], transport: textTransport(reply) });
    expect(out.kind).toBe("questions");
    if (out.kind === "questions") expect(out.round.questions[0].id).toBe("q1");
  });

  it("maps a complete reply to a complete outcome", async () => {
    const out = await runKnead({
      epicDescription: "Epic",
      rounds: [],
      transport: textTransport('{"kind":"complete"}'),
    });
    expect(out.kind).toBe("complete");
  });

  it("returns cap_reached when 5 rounds are already answered and no override", async () => {
    const reply = JSON.stringify({
      kind: "questions",
      questions: [{ id: "q1", prompt: "P", section: "business", type: "text" }],
      justification: "Need more.",
    });
    const fiveRounds = Array.from({ length: 5 }, () => ({ questions: [], answers: {} }));
    const out = await runKnead({ epicDescription: "Epic", rounds: fiveRounds, transport: textTransport(reply) });
    expect(out.kind).toBe("cap_reached");
  });

  it("stub transport returns a round 1, then complete", async () => {
    const stub = makeStubTransport();
    const collect = async (rounds: unknown[]) => {
      let buf = "";
      await stub.runRole({
        role: "knead",
        systemPrompt: "",
        userMessage: JSON.stringify({ rounds }),
        cwd: process.cwd(),
        onEvent: (e) => {
          if (e.type === "token") buf += e.text;
        },
      });
      return JSON.parse(buf);
    };
    expect((await collect([])).kind).toBe("questions");
    expect((await collect([{ questions: [], answers: {} }])).kind).toBe("complete");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- tests/lib/agent-knead.test.ts`
Expected: FAIL — `runKnead` is not exported; stub has no `knead` branch.

- [ ] **Step 4: Implement runKnead and the stub branch**

In `lib/agent/index.ts`, add the import near the top (with the other `lib` imports):

```ts
import { parseKneadResponse, applyCap } from "@/lib/knead/parse";
import type { KneadOutcome, KneadRound } from "@/lib/knead/types";
```

Add `runKnead` after `runHelp` (before the "Default transport" section comment):

```ts
export async function runKnead(args: {
  epicDescription: string;
  rounds: KneadRound[];
  overrideCapApproved?: boolean;
  transport: AgentTransport;
  signal?: AbortSignal;
}): Promise<KneadOutcome> {
  const systemPrompt = await loadSkillPrompt("task-knead");
  const userMessage = JSON.stringify({
    epicDescription: args.epicDescription,
    rounds: args.rounds,
    roundNumber: args.rounds.length + 1,
    maxFreeRounds: 5,
    overrideCapApproved: Boolean(args.overrideCapApproved),
  });

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

  const result = parseKneadResponse(buffer);
  return applyCap(result, args.rounds.length, Boolean(args.overrideCapApproved));
}
```

In `makeStubTransport`, the `runRole` currently destructures `{ role, onEvent }`. Change it to also read `userMessage`:

```ts
    async runRole({ role, userMessage, onEvent }) {
```

Then add this branch alongside the others (e.g. after the `title-suggest` branch):

```ts
      } else if (role === "knead") {
        let priorRounds = 0;
        try {
          const parsed = JSON.parse(userMessage) as { rounds?: unknown[] };
          priorRounds = Array.isArray(parsed.rounds) ? parsed.rounds.length : 0;
        } catch {
          /* ignore — treat as round 1 */
        }
        const payload =
          priorRounds === 0
            ? {
                kind: "questions",
                questions: [
                  { id: "q-surfaces", prompt: "Which product surfaces are impacted?", section: "business", type: "multi", options: ["Web app", "Admin console", "API", "Mobile"] },
                  { id: "q-risk", prompt: "What is the rollout risk?", section: "technical", type: "single", options: ["Low", "Medium", "High"] },
                ],
              }
            : { kind: "complete" };
        onEvent({ type: "token", text: JSON.stringify(payload) });
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- tests/lib/agent-knead.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add skills/task-knead/SKILL.md lib/agent/index.ts tests/lib/agent-knead.test.ts
git commit -m "feat(AI-36): knead skill prompt, runKnead, stub transport branch"
```

---

## Task 4: POST /api/knead route

**Files:**
- Modify: `lib/api/schemas.ts` (add `KneadBodySchema` at end, before the type exports)
- Create: `app/api/knead/route.ts`
- Test: `tests/api/knead.test.ts`

- [ ] **Step 1: Add the request schema**

In `lib/api/schemas.ts`, add the import at the top and the schema before the `export type` block:

```ts
import { KneadQuestionSchema } from "@/lib/knead/parse";
```

```ts
export const KneadBodySchema = z.object({
  epicDescription: z.string().min(1),
  rounds: z.array(
    z.object({
      questions: z.array(KneadQuestionSchema),
      answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
    }),
  ),
  overrideCapApproved: z.boolean().optional(),
});

export type KneadBody = z.infer<typeof KneadBodySchema>;
```

- [ ] **Step 2: Write the failing route tests**

Create `tests/api/knead.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/auth/requireSession", () => ({
  requireSession: vi.fn(async () => ({
    accessToken: "tok", refreshToken: "rt", expiresAt: Date.now() + 3_600_000,
    accountId: "acc-1", email: "test@example.com",
  })),
}));

import { POST } from "@/app/api/knead/route";

function makeReq(body: unknown, origin?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin) headers.origin = origin;
  return new Request("http://x/api/knead", { method: "POST", headers, body: JSON.stringify(body) });
}

describe("POST /api/knead (stub transport)", () => {
  const prev = process.env.TASK_AGENT_MODE;
  beforeEach(() => { process.env.TASK_AGENT_MODE = "stub"; });
  afterEach(() => { if (prev === undefined) delete process.env.TASK_AGENT_MODE; else process.env.TASK_AGENT_MODE = prev; });

  it("returns a questions outcome for round 1", async () => {
    const res = await POST(makeReq({ epicDescription: "An onboarding wizard", rounds: [] }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.kind).toBe("questions");
    expect(json.round.questions.length).toBeGreaterThan(0);
  });

  it("returns complete after a prior round", async () => {
    const res = await POST(makeReq({
      epicDescription: "An onboarding wizard",
      rounds: [{ questions: [], answers: {} }],
    }));
    const json = await res.json();
    expect(json.kind).toBe("complete");
  });

  it("returns 400 for an empty epic description", async () => {
    const res = await POST(makeReq({ epicDescription: "", rounds: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for malformed JSON", async () => {
    const r = new Request("http://x/api/knead", {
      method: "POST", headers: { "content-type": "application/json" }, body: "not-json",
    });
    expect((await POST(r)).status).toBe(400);
  });

  it("rejects a disallowed origin when TASK_EMBED_ORIGINS is set", async () => {
    process.env.TASK_EMBED_ORIGINS = "https://allowed.example";
    try {
      const res = await POST(makeReq({ epicDescription: "x", rounds: [] }, "https://evil.example"));
      expect(res.status).toBe(403);
    } finally {
      delete process.env.TASK_EMBED_ORIGINS;
    }
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- tests/api/knead.test.ts`
Expected: FAIL — `@/app/api/knead/route` does not exist.

- [ ] **Step 4: Implement the route**

Create `app/api/knead/route.ts` (mirrors `app/api/title/suggest/route.ts`):

```ts
import { NextResponse } from "next/server";
import { KneadBodySchema } from "@/lib/api/schemas";
import { makeTransport, runKnead } from "@/lib/agent";
import { requireSession } from "@/lib/auth/requireSession";

export const runtime = "nodejs";

function isOriginAllowed(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const raw = process.env.TASK_EMBED_ORIGINS ?? "";
  const allow = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (allow.length === 0) return true;
  return allow.includes(origin);
}

export async function POST(req: Request) {
  const sessionOrRes = await requireSession();
  if (sessionOrRes instanceof NextResponse) return sessionOrRes;

  if (!isOriginAllowed(req)) {
    return NextResponse.json({ error: "origin not allowed" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = KneadBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const transport = makeTransport();
  try {
    const outcome = await runKnead({
      epicDescription: parsed.data.epicDescription,
      rounds: parsed.data.rounds,
      overrideCapApproved: parsed.data.overrideCapApproved,
      transport,
    });
    return NextResponse.json(outcome);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- tests/api/knead.test.ts && npm run typecheck`
Expected: PASS. (If `beforeEach`/`afterEach` are reported undefined, add them to the vitest import — globals are enabled in `vitest.config.ts`, so they should already exist.)

- [ ] **Step 6: Commit**

```bash
git add lib/api/schemas.ts app/api/knead/route.ts tests/api/knead.test.ts
git commit -m "feat(AI-36): POST /api/knead route + request schema"
```

---

## Task 5: Epic-mode state transition helpers (pure)

**Files:**
- Create: `lib/epic/state.ts`
- Test: `tests/lib/epic-state.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/epic-state.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  startInterview, appendRound, setAnswer, markComplete, resetDough,
  currentRound, isCurrentRoundAnswered, isAnswered,
} from "@/lib/epic/state";
import { EMPTY_KNEAD, type KneadQuestion } from "@/lib/knead/types";

const qs: KneadQuestion[] = [
  { id: "a", prompt: "A", section: "business", type: "text" },
  { id: "b", prompt: "B", section: "technical", type: "multi", options: ["x", "y"] },
];

describe("isAnswered", () => {
  it("text needs non-empty trimmed value", () => {
    expect(isAnswered({ id: "a", prompt: "A", section: "business", type: "text" }, "")).toBe(false);
    expect(isAnswered({ id: "a", prompt: "A", section: "business", type: "text" }, "  ")).toBe(false);
    expect(isAnswered({ id: "a", prompt: "A", section: "business", type: "text" }, "hi")).toBe(true);
  });
  it("multi needs at least one selection", () => {
    const q: KneadQuestion = { id: "b", prompt: "B", section: "business", type: "multi", options: ["x"] };
    expect(isAnswered(q, [])).toBe(false);
    expect(isAnswered(q, ["x"])).toBe(true);
    expect(isAnswered(q, undefined)).toBe(false);
  });
});

describe("knead state transitions", () => {
  it("startInterview records the source description and clears rounds", () => {
    const s = startInterview(EMPTY_KNEAD, "epic text");
    expect(s.status).toBe("interviewing");
    expect(s.rounds).toEqual([]);
    expect(s.sourceDescription).toBe("epic text");
  });

  it("appendRound adds a round with empty answers", () => {
    const s = appendRound(startInterview(EMPTY_KNEAD, "d"), qs);
    expect(s.rounds).toHaveLength(1);
    expect(currentRound(s)?.questions).toEqual(qs);
    expect(currentRound(s)?.answers).toEqual({});
  });

  it("setAnswer updates the current round only", () => {
    let s = appendRound(startInterview(EMPTY_KNEAD, "d"), qs);
    s = setAnswer(s, "a", "hello");
    expect(currentRound(s)?.answers).toEqual({ a: "hello" });
  });

  it("isCurrentRoundAnswered is true only when every question is answered", () => {
    let s = appendRound(startInterview(EMPTY_KNEAD, "d"), qs);
    expect(isCurrentRoundAnswered(s)).toBe(false);
    s = setAnswer(s, "a", "hello");
    expect(isCurrentRoundAnswered(s)).toBe(false);
    s = setAnswer(s, "b", ["x"]);
    expect(isCurrentRoundAnswered(s)).toBe(true);
  });

  it("markComplete sets status complete and keeps rounds", () => {
    const s = markComplete(appendRound(startInterview(EMPTY_KNEAD, "d"), qs));
    expect(s.status).toBe("complete");
    expect(s.rounds).toHaveLength(1);
  });

  it("resetDough(keep=false) clears rounds back to idle", () => {
    const s = resetDough(appendRound(startInterview(EMPTY_KNEAD, "d"), qs), false);
    expect(s).toEqual(EMPTY_KNEAD);
  });

  it("resetDough(keep=true) keeps answered rounds but returns to idle", () => {
    let s = appendRound(startInterview(EMPTY_KNEAD, "d"), qs);
    s = setAnswer(s, "a", "hi");
    const reset = resetDough(s, true);
    expect(reset.status).toBe("idle");
    expect(reset.rounds).toHaveLength(1);
    expect(currentRound(reset)?.answers).toEqual({ a: "hi" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/lib/epic-state.test.ts`
Expected: FAIL — `@/lib/epic/state` does not exist.

- [ ] **Step 3: Implement the helpers**

Create `lib/epic/state.ts`:

```ts
import {
  type KneadState, type KneadQuestion, type KneadAnswerValue,
  type KneadRound, EMPTY_KNEAD,
} from "@/lib/knead/types";

export function isAnswered(q: KneadQuestion, value: KneadAnswerValue | undefined): boolean {
  if (value === undefined) return false;
  if (q.type === "multi") return Array.isArray(value) && value.length > 0;
  return typeof value === "string" && value.trim().length > 0;
}

export function currentRound(state: KneadState): KneadRound | undefined {
  return state.rounds[state.rounds.length - 1];
}

export function startInterview(_state: KneadState, sourceDescription: string): KneadState {
  return { status: "interviewing", rounds: [], sourceDescription };
}

export function appendRound(state: KneadState, questions: KneadQuestion[]): KneadState {
  return {
    ...state,
    status: "interviewing",
    rounds: [...state.rounds, { questions, answers: {} }],
  };
}

export function setAnswer(state: KneadState, qid: string, value: KneadAnswerValue): KneadState {
  const last = state.rounds.length - 1;
  if (last < 0) return state;
  const rounds = state.rounds.map((r, i) =>
    i === last ? { ...r, answers: { ...r.answers, [qid]: value } } : r,
  );
  return { ...state, rounds };
}

export function isCurrentRoundAnswered(state: KneadState): boolean {
  const round = currentRound(state);
  if (!round || round.questions.length === 0) return false;
  return round.questions.every((q) => isAnswered(q, round.answers[q.id]));
}

export function markComplete(state: KneadState): KneadState {
  return { ...state, status: "complete" };
}

// keepAnswers=true preserves prior rounds so the next run can be seeded with
// them; false discards all dough. Either way we return to idle so the left-pane
// "Knead tasks" button drives the next run.
export function resetDough(state: KneadState, keepAnswers: boolean): KneadState {
  if (!keepAnswers) return { ...EMPTY_KNEAD };
  return { status: "idle", rounds: state.rounds, sourceDescription: undefined };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/lib/epic-state.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/epic/state.ts tests/lib/epic-state.test.ts
git commit -m "feat(AI-36): pure knead state transition helpers"
```

---

## Task 6: QuestionField component

**Files:**
- Create: `components/epic/QuestionField.tsx`
- Test: `tests/components/epic/QuestionField.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/components/epic/QuestionField.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuestionField } from "@/components/epic/QuestionField";
import type { KneadQuestion } from "@/lib/knead/types";

beforeEach(() => {});

const textQ: KneadQuestion = { id: "t", prompt: "Describe the value", section: "business", type: "text" };
const singleQ: KneadQuestion = { id: "s", prompt: "Rollout risk?", section: "technical", type: "single", options: ["Low", "High"] };
const multiQ: KneadQuestion = { id: "m", prompt: "Which surfaces?", section: "business", type: "multi", options: ["Web", "API"] };

describe("<QuestionField>", () => {
  it("renders a textarea for text questions and reports changes", async () => {
    const onChange = vi.fn();
    render(<QuestionField question={textQ} value="" onChange={onChange} />);
    await userEvent.type(screen.getByLabelText(/describe the value/i), "big");
    expect(onChange).toHaveBeenLastCalledWith("big");
  });

  it("renders radios for single questions and reports the chosen option", async () => {
    const onChange = vi.fn();
    render(<QuestionField question={singleQ} value={undefined} onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "High" }));
    expect(onChange).toHaveBeenCalledWith("High");
  });

  it("renders checkboxes for multi questions and toggles selections", async () => {
    const onChange = vi.fn();
    render(<QuestionField question={multiQ} value={["Web"]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "API" }));
    expect(onChange).toHaveBeenCalledWith(["Web", "API"]);
    await userEvent.click(screen.getByRole("checkbox", { name: "Web" }));
    // From the original ["Web"], unchecking Web yields [].
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/components/epic/QuestionField.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement the component**

Create `components/epic/QuestionField.tsx`:

```tsx
"use client";

import { TextArea } from "@/components/ui/TextField";
import type { KneadQuestion, KneadAnswerValue } from "@/lib/knead/types";

type Props = {
  question: KneadQuestion;
  value: KneadAnswerValue | undefined;
  onChange: (value: KneadAnswerValue) => void;
  disabled?: boolean;
};

export function QuestionField({ question, value, onChange, disabled }: Props) {
  if (question.type === "text") {
    return (
      <TextArea
        label={question.prompt}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="min-h-[72px]"
      />
    );
  }

  if (question.type === "single") {
    const selected = typeof value === "string" ? value : "";
    return (
      <fieldset className="flex flex-col gap-1.5" disabled={disabled}>
        <legend className="text-hig-subhead font-medium text-ink mb-1">{question.prompt}</legend>
        {(question.options ?? []).map((opt) => (
          <label key={opt} className="flex items-center gap-2 text-hig-body text-ink">
            <input
              type="radio"
              name={question.id}
              value={opt}
              checked={selected === opt}
              onChange={() => onChange(opt)}
              className="accent-accent"
            />
            {opt}
          </label>
        ))}
      </fieldset>
    );
  }

  // multi
  const selected = Array.isArray(value) ? value : [];
  return (
    <fieldset className="flex flex-col gap-1.5" disabled={disabled}>
      <legend className="text-hig-subhead font-medium text-ink mb-1">{question.prompt}</legend>
      {(question.options ?? []).map((opt) => (
        <label key={opt} className="flex items-center gap-2 text-hig-body text-ink">
          <input
            type="checkbox"
            value={opt}
            checked={selected.includes(opt)}
            onChange={(e) =>
              onChange(e.target.checked ? [...selected, opt] : selected.filter((o) => o !== opt))
            }
            className="accent-accent"
          />
          {opt}
        </label>
      ))}
    </fieldset>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/components/epic/QuestionField.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/epic/QuestionField.tsx tests/components/epic/QuestionField.test.tsx
git commit -m "feat(AI-36): QuestionField renders text/single/multi answers"
```

---

## Task 7: CapturedContext mirror component

**Files:**
- Create: `components/epic/CapturedContext.tsx`
- Test: `tests/components/epic/CapturedContext.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/components/epic/CapturedContext.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CapturedContext } from "@/components/epic/CapturedContext";
import type { KneadRound } from "@/lib/knead/types";

const rounds: KneadRound[] = [
  {
    questions: [
      { id: "a", prompt: "Primary user?", section: "business", type: "text" },
      { id: "b", prompt: "Surfaces?", section: "business", type: "multi", options: ["Web", "API"] },
      { id: "c", prompt: "Unanswered?", section: "technical", type: "text" },
    ],
    answers: { a: "Admins", b: ["Web", "API"] },
  },
];

describe("<CapturedContext>", () => {
  it("renders answered questions with their answers", () => {
    render(<CapturedContext rounds={rounds} />);
    expect(screen.getByText("Primary user?")).toBeInTheDocument();
    expect(screen.getByText("Admins")).toBeInTheDocument();
    expect(screen.getByText("Web, API")).toBeInTheDocument();
  });

  it("omits questions that have no answer yet", () => {
    render(<CapturedContext rounds={rounds} />);
    expect(screen.queryByText("Unanswered?")).not.toBeInTheDocument();
  });

  it("renders nothing when there are no answered questions", () => {
    const { container } = render(<CapturedContext rounds={[{ questions: [], answers: {} }]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("has no form controls (read-only)", () => {
    render(<CapturedContext rounds={rounds} />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/components/epic/CapturedContext.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement the component**

Create `components/epic/CapturedContext.tsx`:

```tsx
"use client";

import { isAnswered } from "@/lib/epic/state";
import type { KneadRound, KneadAnswerValue } from "@/lib/knead/types";

function formatAnswer(value: KneadAnswerValue): string {
  return Array.isArray(value) ? value.join(", ") : value;
}

type Props = { rounds: KneadRound[] };

export function CapturedContext({ rounds }: Props) {
  const answered = rounds.flatMap((round) =>
    round.questions
      .filter((q) => isAnswered(q, round.answers[q.id]))
      .map((q) => ({ id: q.id, prompt: q.prompt, answer: formatAnswer(round.answers[q.id]) })),
  );

  if (answered.length === 0) return null;

  return (
    <section aria-label="Captured context" className="mt-4 flex flex-col gap-2">
      <h3 className="hig-section-label">Captured context</h3>
      <ul className="flex flex-col gap-2">
        {answered.map((item) => (
          <li key={item.id} className="border-l-2 border-accent/40 bg-accent-tint/40 rounded-r-md px-3 py-1.5">
            <p className="text-hig-footnote font-medium text-ink-secondary">{item.prompt}</p>
            <p className="text-hig-body text-ink">{item.answer}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/components/epic/CapturedContext.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/epic/CapturedContext.tsx tests/components/epic/CapturedContext.test.tsx
git commit -m "feat(AI-36): read-only CapturedContext answer mirror"
```

---

## Task 8: KneadingPanel (right-pane interview)

**Files:**
- Create: `components/epic/KneadingPanel.tsx`
- Test: `tests/components/epic/KneadingPanel.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/components/epic/KneadingPanel.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KneadingPanel } from "@/components/epic/KneadingPanel";
import type { KneadState } from "@/lib/knead/types";

function interviewing(answers: Record<string, string | string[]> = {}): KneadState {
  return {
    status: "interviewing",
    rounds: [{
      questions: [
        { id: "a", prompt: "Primary user?", section: "business", type: "text" },
        { id: "b", prompt: "Risk?", section: "technical", type: "single", options: ["Low", "High"] },
      ],
      answers,
    }],
  };
}

const noop = () => {};
const baseProps = {
  loading: false, error: null, capPrompt: null,
  onAnswer: noop, onKnead: noop, onApproveCap: noop, onDeclineCap: noop, onRetry: noop,
};

describe("<KneadingPanel>", () => {
  it("groups questions under Business and Technical headings", () => {
    render(<KneadingPanel {...baseProps} state={interviewing()} />);
    expect(screen.getByText(/business/i)).toBeInTheDocument();
    expect(screen.getByText(/technical/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/primary user/i)).toBeInTheDocument();
  });

  it("disables Knead until every question is answered", async () => {
    const onKnead = vi.fn();
    const { rerender } = render(<KneadingPanel {...baseProps} state={interviewing()} onKnead={onKnead} />);
    expect(screen.getByRole("button", { name: /^knead$/i })).toBeDisabled();
    rerender(<KneadingPanel {...baseProps} state={interviewing({ a: "Admins", b: "Low" })} onKnead={onKnead} />);
    const btn = screen.getByRole("button", { name: /^knead$/i });
    expect(btn).not.toBeDisabled();
    await userEvent.click(btn);
    expect(onKnead).toHaveBeenCalled();
  });

  it("reports answer changes via onAnswer", async () => {
    const onAnswer = vi.fn();
    render(<KneadingPanel {...baseProps} state={interviewing()} onAnswer={onAnswer} />);
    await userEvent.click(screen.getByRole("radio", { name: "High" }));
    expect(onAnswer).toHaveBeenCalledWith("b", "High");
  });

  it("shows a loading state", () => {
    render(<KneadingPanel {...baseProps} state={interviewing()} loading />);
    expect(screen.getByText(/kneading/i)).toBeInTheDocument();
  });

  it("shows an error with a retry button", async () => {
    const onRetry = vi.fn();
    render(<KneadingPanel {...baseProps} state={interviewing()} error="boom" onRetry={onRetry} />);
    expect(screen.getByText(/boom/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("shows the cap prompt with justification and yes/no actions", async () => {
    const onApproveCap = vi.fn();
    render(<KneadingPanel {...baseProps} state={interviewing()} capPrompt={{ justification: "Need auth details." }} onApproveCap={onApproveCap} />);
    expect(screen.getByText(/need auth details/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onApproveCap).toHaveBeenCalled();
  });

  it("shows the complete state with a disabled Generate sub-tasks button", () => {
    const complete: KneadState = { status: "complete", rounds: interviewing({ a: "x", b: "Low" }).rounds };
    render(<KneadingPanel {...baseProps} state={complete} />);
    expect(screen.getByText(/kneading complete/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate sub-tasks/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/components/epic/KneadingPanel.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement the component**

Create `components/epic/KneadingPanel.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/Button";
import { QuestionField } from "@/components/epic/QuestionField";
import { currentRound, isCurrentRoundAnswered } from "@/lib/epic/state";
import type { KneadState, KneadAnswerValue, KneadSection } from "@/lib/knead/types";

type Props = {
  state: KneadState;
  loading: boolean;
  error: string | null;
  capPrompt: { justification: string } | null;
  onAnswer: (qid: string, value: KneadAnswerValue) => void;
  onKnead: () => void;
  onApproveCap: () => void;
  onDeclineCap: () => void;
  onRetry: () => void;
};

const SECTION_LABEL: Record<KneadSection, string> = { business: "Business", technical: "Technical" };

export function KneadingPanel({
  state, loading, error, capPrompt, onAnswer, onKnead, onApproveCap, onDeclineCap, onRetry,
}: Props) {
  const round = currentRound(state);

  return (
    <aside className="w-[420px] shrink-0 border-l border-rule bg-surface h-full overflow-y-auto p-5 flex flex-col gap-4">
      <header className="flex flex-col gap-0.5">
        <span className="hig-section-label">Knead</span>
        <h2 className="text-hig-title3">
          {state.status === "complete" ? "Kneading complete" : "Refine the epic"}
        </h2>
      </header>

      {error && (
        <div className="rounded-md bg-danger/5 border border-danger/30 px-3 py-2 flex items-center gap-2" role="alert">
          <p className="text-hig-footnote text-danger flex-1">{error}</p>
          <Button type="button" size="sm" variant="secondary" onClick={onRetry}>Retry</Button>
        </div>
      )}

      {capPrompt && (
        <div className="rounded-md bg-warning-tint border border-warning/40 px-3 py-3 flex flex-col gap-2" role="alert">
          <p className="text-hig-footnote text-ink">
            The AI would like another round of questions: {capPrompt.justification}
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={onApproveCap}>Continue</Button>
            <Button type="button" size="sm" variant="secondary" onClick={onDeclineCap}>Stop here</Button>
          </div>
        </div>
      )}

      {loading && <p className="text-hig-footnote text-ink-secondary">Kneading…</p>}

      {state.status === "complete" ? (
        <div className="flex flex-col gap-3">
          <p className="text-hig-body text-ink-secondary">
            Context captured across {state.rounds.length} round{state.rounds.length === 1 ? "" : "s"}.
            Ready to turn into sub-tasks.
          </p>
          <Button type="button" disabled title="Sub-task generation arrives in SP2">
            Generate sub-tasks
          </Button>
        </div>
      ) : (
        round && (
          <>
            {(["business", "technical"] as KneadSection[]).map((section) => {
              const sectionQs = round.questions.filter((q) => q.section === section);
              if (sectionQs.length === 0) return null;
              return (
                <div key={section} className="flex flex-col gap-3">
                  <h3 className="hig-section-label">{SECTION_LABEL[section]}</h3>
                  {sectionQs.map((q) => (
                    <QuestionField
                      key={q.id}
                      question={q}
                      value={round.answers[q.id]}
                      onChange={(v) => onAnswer(q.id, v)}
                      disabled={loading}
                    />
                  ))}
                </div>
              );
            })}
            <Button
              type="button"
              onClick={onKnead}
              disabled={loading || !isCurrentRoundAnswered(state)}
              className="mt-2"
            >
              Knead
            </Button>
          </>
        )
      )}
    </aside>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/components/epic/KneadingPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/epic/KneadingPanel.tsx tests/components/epic/KneadingPanel.test.tsx
git commit -m "feat(AI-36): KneadingPanel right-pane interview"
```

---

## Task 9: LostDoughWarning component

**Files:**
- Create: `components/epic/LostDoughWarning.tsx`
- Test: `tests/components/epic/LostDoughWarning.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/components/epic/LostDoughWarning.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LostDoughWarning } from "@/components/epic/LostDoughWarning";

describe("<LostDoughWarning>", () => {
  it("calls onConfirm with keepAnswers=false by default", async () => {
    const onConfirm = vi.fn();
    render(<LostDoughWarning onConfirm={onConfirm} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /re-?knead/i }));
    expect(onConfirm).toHaveBeenCalledWith(false);
  });

  it("calls onConfirm with keepAnswers=true when the checkbox is ticked", async () => {
    const onConfirm = vi.fn();
    render(<LostDoughWarning onConfirm={onConfirm} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole("checkbox", { name: /keep already-answered questions/i }));
    await userEvent.click(screen.getByRole("button", { name: /re-?knead/i }));
    expect(onConfirm).toHaveBeenCalledWith(true);
  });

  it("calls onCancel when dismissed", async () => {
    const onCancel = vi.fn();
    render(<LostDoughWarning onConfirm={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/components/epic/LostDoughWarning.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement the component**

Create `components/epic/LostDoughWarning.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

type Props = {
  onConfirm: (keepAnswers: boolean) => void;
  onCancel: () => void;
};

export function LostDoughWarning({ onConfirm, onCancel }: Props) {
  const [keep, setKeep] = useState(false);
  return (
    <div className="rounded-md bg-warning-tint border border-warning/40 px-4 py-3 flex flex-col gap-3" role="alert">
      <p className="text-hig-footnote text-ink">
        You edited the epic description after kneading. Re-kneading discards the current dough —
        all questions and answers will be lost.
      </p>
      <label className="flex items-center gap-2 text-hig-footnote text-ink">
        <input
          type="checkbox"
          checked={keep}
          onChange={(e) => setKeep(e.target.checked)}
          className="accent-accent"
        />
        Keep already-answered questions for the next run
      </label>
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={() => onConfirm(keep)}>Re-knead</Button>
        <Button type="button" size="sm" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/components/epic/LostDoughWarning.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/epic/LostDoughWarning.tsx tests/components/epic/LostDoughWarning.test.tsx
git commit -m "feat(AI-36): LostDoughWarning with keep-answers checkbox"
```

---

## Task 10: Editor epic-mode props

**Files:**
- Modify: `components/Editor.tsx` (Props at `:30-35`, submit handler at `:169-173`, button at `:252-254`)
- Test: `tests/components/Editor.test.tsx` (extend existing)

- [ ] **Step 1: Write the failing tests**

Append to `tests/components/Editor.test.tsx` (inside the existing `describe`):

```tsx
  it("shows 'Knead tasks' in epic mode", () => {
    render(<Editor namespace="e1" onFinalize={vi.fn()} mode="epic" onKnead={vi.fn()} />);
    expect(screen.getByRole("button", { name: /knead tasks/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /finalize task/i })).not.toBeInTheDocument();
  });

  it("enables 'Knead tasks' from a description even with no title, and calls onKnead", async () => {
    const onKnead = vi.fn();
    render(<Editor namespace="e2" onFinalize={vi.fn()} mode="epic" onKnead={onKnead} />);
    const btn = screen.getByRole("button", { name: /knead tasks/i });
    expect(btn).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/^description/i), "Build an onboarding wizard");
    expect(screen.getByRole("button", { name: /knead tasks/i })).not.toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /knead tasks/i }));
    expect(onKnead).toHaveBeenCalled();
  });

  it("respects kneadDisabled in epic mode", async () => {
    render(<Editor namespace="e3" onFinalize={vi.fn()} mode="epic" onKnead={vi.fn()} kneadDisabled />);
    await userEvent.type(screen.getByLabelText(/^description/i), "Some epic");
    expect(screen.getByRole("button", { name: /knead tasks/i })).toBeDisabled();
  });
```

Note: `RichTextDescription` is dynamically imported and SSR-disabled; in jsdom it renders the loading skeleton first then resolves. If `getByLabelText(/^description/i)` is flaky, switch those two assertions to `findByLabelText`. The existing Editor tests already rely on this component resolving, so the same approach applies.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/components/Editor.test.tsx`
Expected: FAIL — `mode`/`onKnead` props are not recognized; no "Knead tasks" button.

- [ ] **Step 3: Add the props and behavior**

In `components/Editor.tsx`, extend the `Props` type:

```ts
type Props = {
  namespace: string;
  onFinalize: (draft: Draft) => void;
  disabled?: boolean;
  onHelp?: () => void;
  // Epic mode: relabel the primary button and gate on the epic description.
  mode?: "single" | "epic";
  onKnead?: (draft: Draft) => void;
  kneadDisabled?: boolean;
  onDraftChange?: (draft: Draft) => void;
};
```

Update the function signature destructuring:

```ts
export function Editor({
  namespace, onFinalize, disabled = false, onHelp,
  mode = "single", onKnead, kneadDisabled = false, onDraftChange,
}: Props) {
```

Add a description-presence helper above the component (module scope):

```ts
// TipTap stores rich text as HTML; strip tags to decide whether the epic
// description has real content.
function hasEpicDescription(html: string): boolean {
  return html.replace(/<[^>]*>/g, "").trim().length > 0;
}
```

Notify the parent of draft changes (add after the existing autosave effect at `:60-62`):

```ts
  const onDraftChangeRef = useRef(onDraftChange);
  useEffect(() => { onDraftChangeRef.current = onDraftChange; }, [onDraftChange]);
  useEffect(() => { onDraftChangeRef.current?.(draft); }, [draft]);
```

Change the form `onSubmit` (currently at `:169-173`) to branch on mode:

```tsx
      onSubmit={(e) => {
        e.preventDefault();
        if (mode === "epic") {
          if (onKnead && hasEpicDescription(draft.description)) onKnead(draft);
          return;
        }
        if (!draft.title.trim()) return;
        onFinalize(draft);
      }}
```

Replace the submit button (currently at `:252-254`) with a mode-aware version:

```tsx
        {mode === "epic" ? (
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
        )}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/components/Editor.test.tsx && npm run typecheck`
Expected: PASS (both the new epic tests and the original single-mode tests).

- [ ] **Step 5: Commit**

```bash
git add components/Editor.tsx tests/components/Editor.test.tsx
git commit -m "feat(AI-36): Editor epic mode (Knead tasks button + onDraftChange)"
```

---

## Task 11: Wire epic mode into StandaloneApp

**Files:**
- Modify: `components/StandaloneApp.tsx`
- Test: `tests/components/StandaloneApp.epic.test.tsx`

This task adds: the header **Single task / Epic** switch, kneading orchestration (`fetch("/api/knead")` + state helpers), the left-pane `CapturedContext` mirror, the `KneadingPanel` right pane, and the lost-dough flow.

- [ ] **Step 1: Write the failing test**

Create `tests/components/StandaloneApp.epic.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StandaloneApp } from "@/components/StandaloneApp";

const session = { configured: true, connected: true } as never;

// Deterministic /api/knead: round 1 questions, then complete.
function mockKneadFetch() {
  let calls = 0;
  return vi.fn(async (url: string) => {
    if (typeof url === "string" && url.includes("/api/jira/session")) {
      return { ok: true, json: async () => session } as Response;
    }
    if (typeof url === "string" && url.includes("/api/knead")) {
      calls += 1;
      const body =
        calls === 1
          ? { kind: "questions", round: { questions: [
              { id: "a", prompt: "Risk?", section: "technical", type: "single", options: ["Low", "High"] },
            ] } }
          : { kind: "complete" };
      return { ok: true, json: async () => body } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
  });
}

beforeEach(() => {
  window.localStorage.clear();
  // Seed an epic-mode draft with a description so "Knead tasks" is enabled.
  window.localStorage.setItem(
    "task-creator:draft:standalone",
    JSON.stringify({ title: "Onboarding", description: "<p>Build a wizard</p>", mode: "epic",
      acceptanceCriteria: [], constraints: "", taskType: "epic" }),
  );
});
afterEach(() => vi.restoreAllMocks());

describe("StandaloneApp — epic mode", () => {
  it("kneads a round, answers it, and reaches Kneading complete", async () => {
    vi.stubGlobal("fetch", mockKneadFetch());
    render(<StandaloneApp initialSession={session} />);

    // Epic switch is active (seeded), Knead tasks button present + enabled.
    const kneadTasks = await screen.findByRole("button", { name: /knead tasks/i });
    await waitFor(() => expect(kneadTasks).not.toBeDisabled());
    await userEvent.click(kneadTasks);

    // Round 1 question appears on the right pane.
    expect(await screen.findByText("Risk?")).toBeInTheDocument();

    // Answer it, then Knead.
    await userEvent.click(screen.getByRole("radio", { name: "High" }));
    await userEvent.click(screen.getByRole("button", { name: /^knead$/i }));

    // Reaches complete state.
    expect(await screen.findByText(/kneading complete/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate sub-tasks/i })).toBeDisabled();
  });

  it("switching to Single task restores the Finalize button", async () => {
    vi.stubGlobal("fetch", mockKneadFetch());
    render(<StandaloneApp initialSession={session} />);
    await userEvent.click(await screen.findByRole("tab", { name: /single task/i }));
    expect(await screen.findByRole("button", { name: /finalize task/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/components/StandaloneApp.epic.test.tsx`
Expected: FAIL — no epic switch / Knead tasks wiring yet.

- [ ] **Step 3: Add imports and epic state to StandaloneApp**

In `components/StandaloneApp.tsx`, first add `useRef` to the existing React import (it currently reads `import { useEffect, useMemo, useState } from "react";`):

```ts
import { useEffect, useMemo, useRef, useState } from "react";
```

Then add to the imports block:

```ts
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { KneadingPanel } from "@/components/epic/KneadingPanel";
import { CapturedContext } from "@/components/epic/CapturedContext";
import { LostDoughWarning } from "@/components/epic/LostDoughWarning";
import {
  startInterview, appendRound, setAnswer, markComplete, resetDough,
} from "@/lib/epic/state";
import { EMPTY_KNEAD, type KneadState, type KneadAnswerValue } from "@/lib/knead/types";
```

Inside the `StandaloneApp` component, after the existing `useState` declarations, add epic state:

```ts
  const [epicMode, setEpicMode] = useState(false);
  const [knead, setKnead] = useState<KneadState>(EMPTY_KNEAD);
  const [kneadLoading, setKneadLoading] = useState(false);
  const [kneadError, setKneadError] = useState<string | null>(null);
  const [capPrompt, setCapPrompt] = useState<{ justification: string } | null>(null);
  const [showLostDough, setShowLostDough] = useState(false);
  const [liveDraft, setLiveDraft] = useState<Draft | null>(null);

  // Read-only refs so async handlers see current values without re-binding.
  const kneadRef = useRef(knead);
  useEffect(() => { kneadRef.current = knead; }, [knead]);
  const draftRef = useRef<Draft | null>(liveDraft);
  useEffect(() => { draftRef.current = liveDraft; }, [liveDraft]);

  // Hydrate epic mode + knead block from the persisted draft on mount.
  useEffect(() => {
    const d = loadDraft(NAMESPACE);
    setEpicMode(d.mode === "epic");
    if (d.knead) setKnead(d.knead);
    setLiveDraft(d);
  }, []);

  function persistEpic(nextMode: boolean, nextKnead: KneadState) {
    const current = loadDraft(NAMESPACE);
    saveDraft(NAMESPACE, { ...current, mode: nextMode ? "epic" : "single", knead: nextKnead });
  }

  // The epic description has been edited away from what we kneaded against.
  const doughIsStale =
    knead.rounds.length > 0 &&
    knead.sourceDescription !== undefined &&
    (liveDraft?.description ?? "") !== knead.sourceDescription;
```

- [ ] **Step 4: Add the kneading orchestration functions**

Add these functions inside the component (next to the other handlers like `submit`):

```ts
  async function callKnead(rounds: KneadState["rounds"], overrideCapApproved: boolean) {
    const epicDescription = (draftRef.current?.description ?? "").replace(/<[^>]*>/g, "").trim();
    setKneadLoading(true);
    setKneadError(null);
    setCapPrompt(null);
    try {
      const res = await fetch("/api/knead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ epicDescription, rounds, overrideCapApproved }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.kind) {
        setKneadError(typeof json.error === "string" ? json.error : `Request failed (${res.status}).`);
        return;
      }
      if (json.kind === "questions") {
        setKnead((s) => {
          const next = appendRound(s, json.round.questions);
          persistEpic(true, next);
          return next;
        });
      } else if (json.kind === "complete") {
        setKnead((s) => {
          const next = markComplete(s);
          persistEpic(true, next);
          return next;
        });
      } else if (json.kind === "cap_reached") {
        setCapPrompt({ justification: json.justification });
      }
    } catch (e) {
      setKneadError(e instanceof Error ? e.message : "Network error");
    } finally {
      setKneadLoading(false);
    }
  }

  // Left-pane "Knead tasks": start a fresh run, or surface lost-dough first.
  function startKneading(draft: Draft) {
    if (doughIsStale) { setShowLostDough(true); return; }
    const fresh = startInterview(EMPTY_KNEAD, draft.description);
    setKnead(fresh);
    persistEpic(true, fresh);
    void callKnead([], false);
  }

  function confirmReKnead(keepAnswers: boolean) {
    setShowLostDough(false);
    const kept = resetDough(kneadRef.current, keepAnswers);
    const fresh = startInterview(kept, draftRef.current?.description ?? "");
    // Seed the next request with kept rounds (if any), then start round 1.
    const seeded: KneadState = keepAnswers ? { ...fresh, rounds: kept.rounds } : fresh;
    setKnead(seeded);
    persistEpic(true, seeded);
    void callKnead(seeded.rounds, false);
  }

  function answerQuestion(qid: string, value: KneadAnswerValue) {
    setKnead((s) => {
      const next = setAnswer(s, qid, value);
      persistEpic(true, next);
      return next;
    });
  }

  // Right-pane "Knead": submit the current answered round.
  function continueKneading() {
    void callKnead(kneadRef.current.rounds, false);
  }

  function approveCap() { void callKnead(kneadRef.current.rounds, true); }
  function declineCap() { setCapPrompt(null); }

  function onModeChange(next: "single" | "epic") {
    setEpicMode(next === "epic");
    persistEpic(next === "epic", kneadRef.current);
  }
```

- [ ] **Step 5: Render the mode switch, mirror, and right pane**

In the header (after `<ThemeToggle />`, before `<JiraChip>`), add the switch — only meaningful in the editing state:

```tsx
          {(mode.kind === "idle" || mode.kind === "running") && (
            <SegmentedControl<"single" | "epic">
              ariaLabel="Authoring mode"
              value={epicMode ? "epic" : "single"}
              items={[{ value: "single", label: "Single task" }, { value: "epic", label: "Epic" }]}
              onChange={onModeChange}
            />
          )}
```

In the idle/running left-pane block (currently `:436-443`), pass epic props to `Editor` and render the mirror beneath it:

```tsx
            <div className="flex-1 min-h-0 overflow-y-auto">
              <Editor
                namespace={NAMESPACE}
                onFinalize={submit}
                disabled={mode.kind === "running"}
                onHelp={() => setHelpOpen("editor")}
                mode={epicMode ? "epic" : "single"}
                onKnead={startKneading}
                kneadDisabled={kneadLoading}
                onDraftChange={setLiveDraft}
              />
              {epicMode && (
                <>
                  {doughIsStale && !showLostDough && (
                    <p className="mt-3 text-hig-footnote text-warning">
                      Epic description edited — press “Knead tasks” to re-knead.
                    </p>
                  )}
                  {showLostDough && (
                    <div className="mt-3">
                      <LostDoughWarning
                        onConfirm={confirmReKnead}
                        onCancel={() => setShowLostDough(false)}
                      />
                    </div>
                  )}
                  <CapturedContext rounds={knead.rounds} />
                </>
              )}
            </div>
```

At the end of the main grid — alongside the existing `{mode.kind === "running" && <RunSheet .../>}` block — add the kneading panel as a sibling right-pane column:

```tsx
      {epicMode && (mode.kind === "idle" || mode.kind === "running") && knead.status !== "idle" && (
        <KneadingPanel
          state={knead}
          loading={kneadLoading}
          error={kneadError}
          capPrompt={capPrompt}
          onAnswer={answerQuestion}
          onKnead={continueKneading}
          onApproveCap={approveCap}
          onDeclineCap={declineCap}
          onRetry={continueKneading}
        />
      )}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- tests/components/StandaloneApp.epic.test.tsx && npm run typecheck`
Expected: PASS. Fix any type errors surfaced by `typecheck` (e.g. the merged `useRef` import).

- [ ] **Step 7: Run the full unit suite + lint**

Run: `npm test && npm run lint && npm run typecheck`
Expected: All green. The pre-existing `e2e/` specs are not run by `npm test`.

- [ ] **Step 8: Commit**

```bash
git add components/StandaloneApp.tsx tests/components/StandaloneApp.epic.test.tsx
git commit -m "feat(AI-36): wire epic mode switch + kneading into StandaloneApp"
```

---

## Task 12: End-to-end happy path (stub mode)

**Files:**
- Create: `e2e/epic-mode.spec.ts`

The e2e seeds an epic draft via `addInitScript` (avoids the documented React-19 + Playwright controlled-text-input quirk noted in `e2e/finalize.spec.ts`) and answers the stub round with clickable radio/checkbox controls. The stub transport (`TASK_AGENT_MODE=stub`, set in `playwright.config.ts`) returns one round then `complete`. Lost-dough interactivity is covered by the Vitest component tests, not here.

- [ ] **Step 1: Write the e2e spec**

Create `e2e/epic-mode.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test.describe("epic mode kneading (stub)", () => {
  test("knead a round, answer it, reach Kneading complete", async ({ page }) => {
    // Seed an epic-mode draft so the description is present without typing into
    // the rich-text editor (see finalize.spec.ts for the typed-input quirk).
    await page.addInitScript(() => {
      localStorage.setItem(
        "task-creator:draft:standalone",
        JSON.stringify({
          title: "Onboarding wizard",
          description: "<p>Self-serve onboarding for new workspaces</p>",
          mode: "epic",
          acceptanceCriteria: [],
          constraints: "",
          taskType: "epic",
        }),
      );
    });

    await page.goto("/");

    // Epic switch is active; the primary button reads "Knead tasks".
    const kneadTasks = page.getByRole("button", { name: /knead tasks/i });
    await expect(kneadTasks).toBeEnabled();
    await kneadTasks.click();

    // Stub round 1: a multi + a single question.
    await expect(page.getByText("Which product surfaces are impacted?")).toBeVisible();
    await page.getByRole("checkbox", { name: "Web app" }).check();
    await page.getByRole("radio", { name: "Low" }).check();

    await page.getByRole("button", { name: /^knead$/i }).click();

    // Stub returns complete on the second call.
    await expect(page.getByText(/kneading complete/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /generate sub-tasks/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the e2e spec**

Run: `npm run test:e2e -- epic-mode.spec.ts`
Expected: PASS. (Playwright starts `npm run dev` with `TASK_AGENT_MODE=stub` per `playwright.config.ts`.)

- [ ] **Step 3: Commit**

```bash
git add e2e/epic-mode.spec.ts
git commit -m "test(AI-36): e2e happy path for epic kneading (stub)"
```

---

## Final verification

- [ ] Run the complete suite: `npm test && npm run typecheck && npm run lint`
- [ ] Run e2e: `npm run test:e2e`
- [ ] Manual smoke (`npm run dev`): toggle **Epic**, type a description, **Knead tasks**, answer a round, **Knead**, confirm **Kneading complete** with the disabled **Generate sub-tasks** button; edit the description and confirm the lost-dough warning + keep-answers checkbox behave.

## Spec coverage map

| Spec requirement | Task |
|---|---|
| Single/Epic mode switch | 11 (+10 button) |
| Left-pane entry preserved, button → "Knead tasks" | 10, 11 |
| Read-only answer mirror beneath description | 7, 11 |
| Multi-round interview, Business/Technical grouping | 8 |
| AI-chosen input types (text/single/multi) | 6 |
| ≤25 questions/round (truncation) | 2 |
| Knead enables only when round fully answered | 5, 8 |
| 5-round cap + override prompt with justification | 2, 8, 11 |
| Lost-dough warning + single keep-answers checkbox | 9, 11 |
| "Kneading complete" + disabled Generate sub-tasks (SP2 seam) | 8 |
| Persistence to localStorage draft | 1, 11 |
| Synchronous POST /api/knead (no SSE) | 4 |
| Deterministic stub for tests/e2e | 3, 12 |
| No Jira requirement in SP1 | (route only gates on session, like title/suggest) |
