# Epic Mode SP2 — Generated Sub-task List With Editing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After kneading completes, generate an AI-proposed list of sub-tasks and let the user edit titles, descriptions (≤1500 chars), labels, and Jira-style blocks/is-blocked-by links between sub-tasks — all persisted in the draft.

**Architecture:** Pure logic (types, JSON parsing, a symmetric-link reducer) in `lib/subtasks/`; a new `task-generate-subtasks` skill + `runGenerateSubtasks` agent helper + synchronous `POST /api/subtasks` route (mirrors `/api/knead`); React components under `components/epic/`; wired into `StandaloneApp` + `KneadingPanel`. A shared `lib/json/extract.ts` removes the duplicated JSON-extraction helper. Stub transport keeps tests offline/deterministic.

**Tech Stack:** Next.js 16, React 19, TypeScript, Zod, Tailwind (HIG tokens), nanoid, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-05-27-epic-mode-subtasks-sp2-design.md`

**Conventions:** reuse `components/ui/{Button,TextField}`; HIG token classes only; tests under `tests/{lib,components,api}/`; commit after each task once `npm test` + `npm run typecheck` pass. Per-task, `git add` ONLY that task's files.

---

## File structure

**Create:** `lib/json/extract.ts`, `lib/subtasks/types.ts`, `lib/subtasks/parse.ts`, `lib/subtasks/state.ts`, `skills/task-generate-subtasks/SKILL.md`, `app/api/subtasks/route.ts`, `components/epic/LabelsEditor.tsx`, `components/epic/SubtaskLinksField.tsx`, `components/epic/SubtaskCard.tsx`, `components/epic/SubtaskList.tsx`, plus matching tests.
**Modify:** `lib/knead/parse.ts` + `lib/agent/index.ts` (use shared extractor; add `runGenerateSubtasks` + stub branch), `lib/draft/autosave.ts` (`subtasks` field), `lib/api/schemas.ts` (`KneadRoundSchema`, `SubtasksBodySchema`), `components/epic/KneadingPanel.tsx` (enable Generate), `components/Editor.tsx` (preserve `subtasks`), `components/StandaloneApp.tsx` (generation + list wiring).

---

## Task 1: Shared JSON-object extractor (DRY cleanup)

**Files:** Create `lib/json/extract.ts`, `tests/lib/json-extract.test.ts`; Modify `lib/knead/parse.ts`, `lib/agent/index.ts`.

- [ ] **Step 1: Write the failing test** — `tests/lib/json-extract.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { extractJsonObject } from "@/lib/json/extract";

describe("extractJsonObject", () => {
  it("returns the first balanced top-level object", () => {
    expect(extractJsonObject('{"a":1}')).toBe('{"a":1}');
  });
  it("tolerates surrounding prose and fences", () => {
    expect(extractJsonObject("text\n```json\n{\"a\":1}\n```")).toBe('{"a":1}');
  });
  it("ignores braces inside strings", () => {
    expect(extractJsonObject('{"a":"}"}')).toBe('{"a":"}"}');
  });
  it("returns null when there is no object", () => {
    expect(extractJsonObject("nope")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npm test -- tests/lib/json-extract.test.ts` (module missing).

- [ ] **Step 3: Create `lib/json/extract.ts`:**

```ts
// Extract the first balanced top-level JSON object from arbitrary text
// (tolerates markdown fences and surrounding prose). Pure — no deps.
export function extractJsonObject(raw: string): string | null {
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
```

- [ ] **Step 4: Refactor the two existing copies to import it.**
In `lib/knead/parse.ts`: delete the local `extractJsonObject` function and add `import { extractJsonObject } from "@/lib/json/extract";` (keep `parseKneadResponse` using the same call).
In `lib/agent/index.ts`: delete the local `extractJsonObject` function (around the `parseSkillJson` helper) and add `import { extractJsonObject } from "@/lib/json/extract";`.

- [ ] **Step 5: Run the affected suites** — `npm test -- tests/lib/json-extract.test.ts tests/lib/knead-parse.test.ts tests/lib/agent.test.ts tests/lib/agent-knead.test.ts && npm run typecheck`. All pass (behavior unchanged).

- [ ] **Step 6: Commit**

```bash
git add lib/json/extract.ts tests/lib/json-extract.test.ts lib/knead/parse.ts lib/agent/index.ts
git commit -m "refactor(AI-36): extract shared extractJsonObject into lib/json"
```

---

## Task 2: SubTask types + Draft.subtasks

**Files:** Create `lib/subtasks/types.ts`; Modify `lib/draft/autosave.ts`; Test: extend `tests/lib/draft.test.ts`.

- [ ] **Step 1: Create `lib/subtasks/types.ts`:**

```ts
// Pure types + constants for generated sub-tasks. No SDK/React.

export type SubTask = {
  id: string;
  title: string;
  description: string;
  labels: string[];
  blocks: string[];     // ids of sub-tasks this one blocks
  blockedBy: string[];  // ids of sub-tasks that block this one
};

// What the AI proposes (blocks are 0-based indices into the proposed array).
export type ProposedSubtask = {
  title: string;
  description: string;
  labels: string[];
  blocks: number[];
};

export const MAX_DESCRIPTION = 1500;
export const MAX_SUBTASKS = 50;
```

- [ ] **Step 2: Write the failing test** — append to `tests/lib/draft.test.ts` inside the existing describe:

```ts
  it("loadDraft preserves a subtasks array", () => {
    const subtasks = [{ id: "s1", title: "T", description: "D", labels: ["x"], blocks: [], blockedBy: [] }];
    window.localStorage.setItem("task-creator:draft:st", JSON.stringify({ title: "T", subtasks }));
    expect(loadDraft("st").subtasks).toEqual(subtasks);
  });

  it("loadDraft leaves subtasks undefined when absent", () => {
    window.localStorage.setItem("task-creator:draft:st2", JSON.stringify({ title: "T" }));
    expect(loadDraft("st2").subtasks).toBeUndefined();
  });
```

- [ ] **Step 3: Run, expect FAIL** — `npm test -- tests/lib/draft.test.ts`.

- [ ] **Step 4: Extend Draft.** In `lib/draft/autosave.ts`:
- add `import type { SubTask } from "@/lib/subtasks/types";` next to the other type imports.
- add to the `Draft` type after `knead?`:
```ts
  subtasks?: SubTask[];
```
- in `loadDraft`'s try-block return, add:
```ts
      subtasks: Array.isArray(parsed.subtasks) ? parsed.subtasks : undefined,
```

- [ ] **Step 5: Run** — `npm test -- tests/lib/draft.test.ts && npm run typecheck`. Pass.

- [ ] **Step 6: Commit**

```bash
git add lib/subtasks/types.ts lib/draft/autosave.ts tests/lib/draft.test.ts
git commit -m "feat(AI-36): SubTask type + Draft.subtasks field"
```

---

## Task 3: Sub-task response parsing (pure)

**Files:** Create `lib/subtasks/parse.ts`, `tests/lib/subtasks-parse.test.ts`.

- [ ] **Step 1: Write the failing test** — `tests/lib/subtasks-parse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseSubtasksResponse } from "@/lib/subtasks/parse";

describe("parseSubtasksResponse", () => {
  it("parses a valid subtasks payload with defaults", () => {
    const raw = JSON.stringify({ subtasks: [{ title: "A" }, { title: "B", description: "d", labels: ["x"], blocks: [0] }] });
    const r = parseSubtasksResponse(raw);
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({ title: "A", description: "", labels: [], blocks: [] });
    expect(r[1].blocks).toEqual([0]);
  });

  it("tolerates fences/prose", () => {
    const r = parseSubtasksResponse("here:\n```json\n" + JSON.stringify({ subtasks: [{ title: "A" }] }) + "\n```");
    expect(r).toHaveLength(1);
  });

  it("truncates descriptions to 1500 chars", () => {
    const long = "x".repeat(2000);
    const r = parseSubtasksResponse(JSON.stringify({ subtasks: [{ title: "A", description: long }] }));
    expect(r[0].description).toHaveLength(1500);
  });

  it("drops out-of-range blocks indices", () => {
    const r = parseSubtasksResponse(JSON.stringify({ subtasks: [{ title: "A", blocks: [5, -1, 0] }] }));
    expect(r[0].blocks).toEqual([0]);
  });

  it("caps the number of subtasks at 50", () => {
    const many = Array.from({ length: 70 }, (_, i) => ({ title: `T${i}` }));
    expect(parseSubtasksResponse(JSON.stringify({ subtasks: many }))).toHaveLength(50);
  });

  it("throws when there is no JSON object", () => {
    expect(() => parseSubtasksResponse("nope")).toThrow(/JSON/i);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npm test -- tests/lib/subtasks-parse.test.ts`.

- [ ] **Step 3: Create `lib/subtasks/parse.ts`:**

```ts
import { z } from "zod";
import { extractJsonObject } from "@/lib/json/extract";
import { type ProposedSubtask, MAX_DESCRIPTION, MAX_SUBTASKS } from "./types";

export const ProposedSubtaskSchema = z.object({
  title: z.string(),
  description: z.string().optional().default(""),
  labels: z.array(z.string()).optional().default([]),
  blocks: z.array(z.number().int()).optional().default([]),
});

const ResponseSchema = z.object({ subtasks: z.array(ProposedSubtaskSchema) });

export function parseSubtasksResponse(raw: string): ProposedSubtask[] {
  const candidate = extractJsonObject(raw);
  if (!candidate) throw new Error(`subtasks: model output had no JSON object. First 200 chars: ${raw.slice(0, 200)}`);
  let json: unknown;
  try {
    json = JSON.parse(candidate);
  } catch {
    throw new Error(`subtasks: model output was not valid JSON. First 200 chars: ${candidate.slice(0, 200)}`);
  }
  const parsed = ResponseSchema.parse(json);
  const capped = parsed.subtasks.slice(0, MAX_SUBTASKS);
  const n = capped.length;
  return capped.map((s) => ({
    title: s.title,
    description: s.description.slice(0, MAX_DESCRIPTION),
    labels: s.labels,
    blocks: s.blocks.filter((i) => i >= 0 && i < n),
  }));
}
```

- [ ] **Step 4: Run** — `npm test -- tests/lib/subtasks-parse.test.ts && npm run typecheck`. Pass.

- [ ] **Step 5: Commit**

```bash
git add lib/subtasks/parse.ts tests/lib/subtasks-parse.test.ts
git commit -m "feat(AI-36): sub-task response parsing (truncate, cap, index validation)"
```

---

## Task 4: Sub-task state reducer (pure, symmetric links)

**Files:** Create `lib/subtasks/state.ts`, `tests/lib/subtasks-state.test.ts`.

- [ ] **Step 1: Write the failing test** — `tests/lib/subtasks-state.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  fromProposed, newSubtask, addSubtask, deleteSubtask, updateSubtask,
  setLabels, addLink, removeLink,
} from "@/lib/subtasks/state";

describe("fromProposed", () => {
  it("assigns ids and resolves blocks indices into symmetric links", () => {
    const list = fromProposed([
      { title: "A", description: "", labels: [], blocks: [1] },
      { title: "B", description: "", labels: [], blocks: [] },
    ]);
    expect(list).toHaveLength(2);
    expect(list[0].blocks).toEqual([list[1].id]);
    expect(list[1].blockedBy).toEqual([list[0].id]);
  });
  it("clamps description and ignores self-links", () => {
    const list = fromProposed([{ title: "A", description: "x".repeat(2000), labels: [], blocks: [0] }]);
    expect(list[0].description).toHaveLength(1500);
    expect(list[0].blocks).toEqual([]);
  });
});

describe("reducer ops", () => {
  it("addSubtask appends a blank sub-task", () => {
    const list = addSubtask([]);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ title: "", description: "", labels: [], blocks: [], blockedBy: [] });
    expect(list[0].id).toBeTruthy();
  });
  it("deleteSubtask removes it and strips dangling links", () => {
    let list = fromProposed([{ title: "A", description: "", labels: [], blocks: [1] }, { title: "B", description: "", labels: [], blocks: [] }]);
    const bId = list[1].id;
    list = deleteSubtask(list, bId);
    expect(list).toHaveLength(1);
    expect(list[0].blocks).toEqual([]);
  });
  it("updateSubtask patches fields and clamps description to 1500", () => {
    let list = addSubtask([]);
    const id = list[0].id;
    list = updateSubtask(list, id, { title: "New", description: "y".repeat(2000) });
    expect(list[0].title).toBe("New");
    expect(list[0].description).toHaveLength(1500);
  });
  it("setLabels dedupes", () => {
    let list = addSubtask([]);
    list = setLabels(list, list[0].id, ["a", "A", "b"]);
    expect(list[0].labels).toEqual(["a", "b"]);
  });
  it("addLink keeps blocks/blockedBy symmetric and ignores self + dup", () => {
    let list = addSubtask(addSubtask([]));
    const [a, b] = [list[0].id, list[1].id];
    list = addLink(list, a, b);
    expect(list[0].blocks).toEqual([b]);
    expect(list[1].blockedBy).toEqual([a]);
    list = addLink(list, a, b); // dup
    expect(list[0].blocks).toEqual([b]);
    list = addLink(list, a, a); // self
    expect(list[0].blocks).toEqual([b]);
  });
  it("removeLink removes both directions", () => {
    let list = addSubtask(addSubtask([]));
    const [a, b] = [list[0].id, list[1].id];
    list = addLink(list, a, b);
    list = removeLink(list, a, b);
    expect(list[0].blocks).toEqual([]);
    expect(list[1].blockedBy).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npm test -- tests/lib/subtasks-state.test.ts`.

- [ ] **Step 3: Create `lib/subtasks/state.ts`:**

```ts
import { nanoid } from "nanoid";
import { dedupeLabels } from "@/lib/jira/metadata";
import { type SubTask, type ProposedSubtask, MAX_DESCRIPTION } from "./types";

export function newSubtask(): SubTask {
  return { id: nanoid(), title: "", description: "", labels: [], blocks: [], blockedBy: [] };
}

export function fromProposed(proposed: ProposedSubtask[]): SubTask[] {
  const list: SubTask[] = proposed.map((p) => ({
    id: nanoid(),
    title: p.title,
    description: p.description.slice(0, MAX_DESCRIPTION),
    labels: dedupeLabels(p.labels),
    blocks: [],
    blockedBy: [],
  }));
  proposed.forEach((p, i) => {
    for (const idx of p.blocks) {
      if (idx === i || idx < 0 || idx >= list.length) continue;
      const blockerId = list[i].id;
      const blockedId = list[idx].id;
      if (!list[i].blocks.includes(blockedId)) list[i].blocks.push(blockedId);
      if (!list[idx].blockedBy.includes(blockerId)) list[idx].blockedBy.push(blockerId);
    }
  });
  return list;
}

export function addSubtask(list: SubTask[]): SubTask[] {
  return [...list, newSubtask()];
}

export function deleteSubtask(list: SubTask[], id: string): SubTask[] {
  return list
    .filter((s) => s.id !== id)
    .map((s) => ({ ...s, blocks: s.blocks.filter((b) => b !== id), blockedBy: s.blockedBy.filter((b) => b !== id) }));
}

export function updateSubtask(
  list: SubTask[],
  id: string,
  patch: Partial<Pick<SubTask, "title" | "description" | "labels">>,
): SubTask[] {
  return list.map((s) =>
    s.id === id
      ? {
          ...s,
          ...patch,
          description: patch.description !== undefined ? patch.description.slice(0, MAX_DESCRIPTION) : s.description,
        }
      : s,
  );
}

export function setLabels(list: SubTask[], id: string, labels: string[]): SubTask[] {
  return updateSubtask(list, id, { labels: dedupeLabels(labels) });
}

export function addLink(list: SubTask[], blockerId: string, blockedId: string): SubTask[] {
  if (blockerId === blockedId) return list;
  return list.map((s) => {
    if (s.id === blockerId) return s.blocks.includes(blockedId) ? s : { ...s, blocks: [...s.blocks, blockedId] };
    if (s.id === blockedId) return s.blockedBy.includes(blockerId) ? s : { ...s, blockedBy: [...s.blockedBy, blockerId] };
    return s;
  });
}

export function removeLink(list: SubTask[], blockerId: string, blockedId: string): SubTask[] {
  return list.map((s) => {
    if (s.id === blockerId) return { ...s, blocks: s.blocks.filter((b) => b !== blockedId) };
    if (s.id === blockedId) return { ...s, blockedBy: s.blockedBy.filter((b) => b !== blockerId) };
    return s;
  });
}
```

- [ ] **Step 4: Run** — `npm test -- tests/lib/subtasks-state.test.ts && npm run typecheck`. Pass.

- [ ] **Step 5: Commit**

```bash
git add lib/subtasks/state.ts tests/lib/subtasks-state.test.ts
git commit -m "feat(AI-36): sub-task reducer with symmetric blocks/blockedBy links"
```

---

## Task 5: Generate-subtasks skill + runGenerateSubtasks + stub

**Files:** Create `skills/task-generate-subtasks/SKILL.md`, `tests/lib/agent-subtasks.test.ts`; Modify `lib/agent/index.ts`.

- [ ] **Step 1: Create `skills/task-generate-subtasks/SKILL.md`:**

```markdown
---
name: task-generate-subtasks
description: Break a kneaded software epic into a proposed list of well-scoped sub-tasks. Strict JSON output.
---

# Generate Sub-tasks Skill

You receive a JSON user message describing an epic and the answers gathered while kneading it:

```json
{
  "epicDescription": "free-form epic text",
  "rounds": [
    { "questions": [{ "id": "q1", "prompt": "...", "section": "business", "type": "single", "options": ["A","B"] }], "answers": { "q1": "A" } }
  ]
}
```

**Output exactly one JSON object** — no markdown, no preamble, no trailing prose:

```json
{
  "subtasks": [
    { "title": "Set up the data model", "description": "Define the schema and migrations.", "labels": ["backend"], "blocks": [1] },
    { "title": "Build the list UI", "description": "Render and edit the items.", "labels": ["frontend"], "blocks": [] }
  ]
}
```

**Rules:**
- Each sub-task needs a short imperative `title` and a `description` (≤1500 characters).
- `labels`: 0+ short kebab/lowercase labels you propose from the epic context; propose new ones freely.
- `blocks`: 0-based indices of OTHER sub-tasks in this same array that this sub-task blocks
  (i.e. they cannot start until it is done). Use it to make sequencing explicit; omit/empty for parallel work.
- Produce a complete, non-overlapping breakdown. Prefer 3–12 sub-tasks for a typical epic.
```

- [ ] **Step 2: Write the failing test** — `tests/lib/agent-subtasks.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { runGenerateSubtasks, makeStubTransport } from "@/lib/agent";
import type { AgentTransport } from "@/lib/agent/types";

function textTransport(text: string): AgentTransport {
  return { async runRole({ onEvent }) { onEvent({ type: "token", text }); } };
}

describe("runGenerateSubtasks", () => {
  it("returns proposed subtasks from a valid reply", async () => {
    const reply = JSON.stringify({ subtasks: [{ title: "A", description: "d", labels: ["x"], blocks: [] }] });
    const r = await runGenerateSubtasks({ epicDescription: "Epic", rounds: [], transport: textTransport(reply) });
    expect(r).toHaveLength(1);
    expect(r[0].title).toBe("A");
  });

  it("stub transport returns a 2-item proposal with a link", async () => {
    const stub = makeStubTransport();
    let buf = "";
    await stub.runRole({
      role: "generate-subtasks", systemPrompt: "", userMessage: "{}", cwd: process.cwd(),
      onEvent: (e) => { if (e.type === "token") buf += e.text; },
    });
    const parsed = JSON.parse(buf);
    expect(parsed.subtasks.length).toBe(2);
    expect(parsed.subtasks[0].blocks).toEqual([1]);
  });
});
```

- [ ] **Step 3: Run, expect FAIL** — `npm test -- tests/lib/agent-subtasks.test.ts`.

- [ ] **Step 4: Implement in `lib/agent/index.ts`.**
Add imports near the other `@/lib` imports:
```ts
import { parseSubtasksResponse } from "@/lib/subtasks/parse";
import type { ProposedSubtask } from "@/lib/subtasks/types";
```
Add after `runKnead`:
```ts
export async function runGenerateSubtasks(args: {
  epicDescription: string;
  rounds: KneadRound[];
  transport: AgentTransport;
  signal?: AbortSignal;
}): Promise<ProposedSubtask[]> {
  const systemPrompt = await loadSkillPrompt("task-generate-subtasks");
  const userMessage = JSON.stringify({ epicDescription: args.epicDescription, rounds: args.rounds });

  let buffer = "";
  let pending: Error | null = null;
  await args.transport.runRole({
    role: "generate-subtasks",
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
  return parseSubtasksResponse(buffer);
}
```
Add a `generate-subtasks` branch in `makeStubTransport` (alongside the `knead` branch):
```ts
      } else if (role === "generate-subtasks") {
        const payload = {
          subtasks: [
            { title: "Set up the data model", description: "Define the schema and migrations.", labels: ["backend"], blocks: [1] },
            { title: "Build the list UI", description: "Render and edit the items.", labels: ["frontend"], blocks: [] },
          ],
        };
        onEvent({ type: "token", text: JSON.stringify(payload) });
```

- [ ] **Step 5: Run** — `npm test -- tests/lib/agent-subtasks.test.ts tests/lib/agent.test.ts && npm run typecheck`. Pass.

- [ ] **Step 6: Commit**

```bash
git add skills/task-generate-subtasks/SKILL.md lib/agent/index.ts tests/lib/agent-subtasks.test.ts
git commit -m "feat(AI-36): generate-subtasks skill, runGenerateSubtasks, stub"
```

---

## Task 6: POST /api/subtasks route

**Files:** Modify `lib/api/schemas.ts`; Create `app/api/subtasks/route.ts`, `tests/api/subtasks.test.ts`.

- [ ] **Step 1: Add schemas.** In `lib/api/schemas.ts`, extract a shared round schema and add the body schema. Replace the inline `rounds` object inside `KneadBodySchema` with a reusable `KneadRoundSchema`:
```ts
export const KneadRoundSchema = z.object({
  questions: z.array(KneadQuestionSchema),
  answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
});
```
Update `KneadBodySchema` to use it: `rounds: z.array(KneadRoundSchema),`. Then add:
```ts
export const SubtasksBodySchema = z.object({
  epicDescription: z.string().min(1),
  rounds: z.array(KneadRoundSchema),
});
export type SubtasksBody = z.infer<typeof SubtasksBodySchema>;
```

- [ ] **Step 2: Write the failing test** — `tests/api/subtasks.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/auth/requireSession", () => ({
  requireSession: vi.fn(async () => ({
    accessToken: "tok", refreshToken: "rt", expiresAt: Date.now() + 3_600_000, accountId: "a", email: "t@e.com",
  })),
}));

import { POST } from "@/app/api/subtasks/route";

function makeReq(body: unknown, origin?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin) headers.origin = origin;
  return new Request("http://x/api/subtasks", { method: "POST", headers, body: JSON.stringify(body) });
}

describe("POST /api/subtasks (stub)", () => {
  const prev = process.env.TASK_AGENT_MODE;
  beforeEach(() => { process.env.TASK_AGENT_MODE = "stub"; });
  afterEach(() => { if (prev === undefined) delete process.env.TASK_AGENT_MODE; else process.env.TASK_AGENT_MODE = prev; });

  it("returns a subtasks array", async () => {
    const res = await POST(makeReq({ epicDescription: "An epic", rounds: [] }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.subtasks.length).toBe(2);
  });

  it("400 on empty epicDescription", async () => {
    expect((await POST(makeReq({ epicDescription: "", rounds: [] }))).status).toBe(400);
  });

  it("400 on malformed JSON", async () => {
    const r = new Request("http://x/api/subtasks", { method: "POST", headers: { "content-type": "application/json" }, body: "x" });
    expect((await POST(r)).status).toBe(400);
  });

  it("403 on disallowed origin when allowlist set", async () => {
    process.env.TASK_EMBED_ORIGINS = "https://allowed.example";
    try {
      expect((await POST(makeReq({ epicDescription: "x", rounds: [] }, "https://evil.example"))).status).toBe(403);
    } finally { delete process.env.TASK_EMBED_ORIGINS; }
  });
});
```

- [ ] **Step 3: Run, expect FAIL** — `npm test -- tests/api/subtasks.test.ts`.

- [ ] **Step 4: Create `app/api/subtasks/route.ts`** (mirror `app/api/knead/route.ts`):

```ts
import { NextResponse } from "next/server";
import { SubtasksBodySchema } from "@/lib/api/schemas";
import { makeTransport, runGenerateSubtasks } from "@/lib/agent";
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
  const parsed = SubtasksBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const transport = makeTransport();
  try {
    const subtasks = await runGenerateSubtasks({
      epicDescription: parsed.data.epicDescription,
      rounds: parsed.data.rounds,
      transport,
    });
    return NextResponse.json({ subtasks });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
```

- [ ] **Step 5: Run** — `npm test -- tests/api/subtasks.test.ts tests/api/knead.test.ts && npm run typecheck`. Pass (knead route still green after the schema refactor).

- [ ] **Step 6: Commit**

```bash
git add lib/api/schemas.ts app/api/subtasks/route.ts tests/api/subtasks.test.ts
git commit -m "feat(AI-36): POST /api/subtasks route + shared KneadRoundSchema"
```

---

## Task 7: LabelsEditor component

**Files:** Create `components/epic/LabelsEditor.tsx`, `tests/components/epic/LabelsEditor.test.tsx`.

- [ ] **Step 1: Write the failing test** — `tests/components/epic/LabelsEditor.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LabelsEditor } from "@/components/epic/LabelsEditor";

function Harness({ initial = [], onChange }: { initial?: string[]; onChange: (v: string[]) => void }) {
  const [value, setValue] = useState<string[]>(initial);
  return <LabelsEditor value={value} onChange={(v) => { setValue(v); onChange(v); }} />;
}

describe("<LabelsEditor>", () => {
  it("adds a label on Enter", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.type(screen.getByLabelText(/add label/i), "backend{Enter}");
    expect(onChange).toHaveBeenLastCalledWith(["backend"]);
  });

  it("dedupes case-insensitively", async () => {
    const onChange = vi.fn();
    render(<Harness initial={["backend"]} onChange={onChange} />);
    await userEvent.type(screen.getByLabelText(/add label/i), "Backend{Enter}");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("removes a label via its × button", async () => {
    const onChange = vi.fn();
    render(<Harness initial={["backend", "frontend"]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /remove backend/i }));
    expect(onChange).toHaveBeenLastCalledWith(["frontend"]);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npm test -- tests/components/epic/LabelsEditor.test.tsx`.

- [ ] **Step 3: Create `components/epic/LabelsEditor.tsx`:**

```tsx
"use client";

import { useState } from "react";
import { dedupeLabels } from "@/lib/jira/metadata";

type Props = { value: string[]; onChange: (next: string[]) => void; disabled?: boolean };

export function LabelsEditor({ value, onChange, disabled }: Props) {
  const [input, setInput] = useState("");

  function add() {
    const trimmed = input.trim();
    if (!trimmed) return;
    const next = dedupeLabels([...value, trimmed]);
    if (next.length !== value.length) onChange(next);
    setInput("");
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-hig-subhead font-medium text-ink">Labels</span>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((l) => (
            <span key={l} className="inline-flex items-center gap-1 rounded-full bg-surface-inset px-2 py-0.5 text-hig-footnote text-ink">
              {l}
              <button
                type="button"
                aria-label={`Remove ${l}`}
                disabled={disabled}
                onClick={() => onChange(value.filter((x) => x !== l))}
                className="text-ink-tertiary hover:text-ink"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        aria-label="Add label"
        value={input}
        disabled={disabled}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
        placeholder="Add a label and press Enter"
        className="w-full rounded-md bg-surface border border-rule text-hig-body text-ink placeholder:text-ink-tertiary h-9 px-3 focus:outline-none focus:border-accent focus:shadow-focus"
      />
    </div>
  );
}
```

- [ ] **Step 4: Run** — `npm test -- tests/components/epic/LabelsEditor.test.tsx && npm run typecheck`. Pass.

- [ ] **Step 5: Commit**

```bash
git add components/epic/LabelsEditor.tsx tests/components/epic/LabelsEditor.test.tsx
git commit -m "feat(AI-36): LabelsEditor tag input (add/remove/dedupe)"
```

---

## Task 8: SubtaskLinksField component

**Files:** Create `components/epic/SubtaskLinksField.tsx`, `tests/components/epic/SubtaskLinksField.test.tsx`.

- [ ] **Step 1: Write the failing test** — `tests/components/epic/SubtaskLinksField.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SubtaskLinksField } from "@/components/epic/SubtaskLinksField";
import type { SubTask } from "@/lib/subtasks/types";

const a: SubTask = { id: "a", title: "Alpha", description: "", labels: [], blocks: ["b"], blockedBy: [] };
const b: SubTask = { id: "b", title: "Beta", description: "", labels: [], blocks: [], blockedBy: ["a"] };
const c: SubTask = { id: "c", title: "Gamma", description: "", labels: [], blocks: [], blockedBy: [] };

describe("<SubtaskLinksField>", () => {
  it("lists current 'blocks' links by title", () => {
    render(<SubtaskLinksField subtask={a} allSubtasks={[a, b, c]} onAddLink={vi.fn()} onRemoveLink={vi.fn()} />);
    expect(screen.getByText(/blocks:/i)).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("adds a blocks link by selecting another sub-task", async () => {
    const onAddLink = vi.fn();
    render(<SubtaskLinksField subtask={a} allSubtasks={[a, b, c]} onAddLink={onAddLink} onRemoveLink={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText(/add a sub-task this blocks/i), "c");
    expect(onAddLink).toHaveBeenCalledWith("a", "c");
  });

  it("removes a blocks link", async () => {
    const onRemoveLink = vi.fn();
    render(<SubtaskLinksField subtask={a} allSubtasks={[a, b, c]} onAddLink={vi.fn()} onRemoveLink={onRemoveLink} />);
    await userEvent.click(screen.getByRole("button", { name: /remove blocks Beta/i }));
    expect(onRemoveLink).toHaveBeenCalledWith("a", "b");
  });

  it("does not offer itself as a link target", () => {
    render(<SubtaskLinksField subtask={a} allSubtasks={[a, b, c]} onAddLink={vi.fn()} onRemoveLink={vi.fn()} />);
    const select = screen.getByLabelText(/add a sub-task this blocks/i) as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).not.toContain("a");
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npm test -- tests/components/epic/SubtaskLinksField.test.tsx`.

- [ ] **Step 3: Create `components/epic/SubtaskLinksField.tsx`:**

```tsx
"use client";

import type { SubTask } from "@/lib/subtasks/types";

type Props = {
  subtask: SubTask;
  allSubtasks: SubTask[];
  onAddLink: (blockerId: string, blockedId: string) => void;
  onRemoveLink: (blockerId: string, blockedId: string) => void;
};

export function SubtaskLinksField({ subtask, allSubtasks, onAddLink, onRemoveLink }: Props) {
  const titleOf = (id: string) => allSubtasks.find((s) => s.id === id)?.title || "(untitled)";
  const others = allSubtasks.filter((s) => s.id !== subtask.id);
  const blocksOptions = others.filter((s) => !subtask.blocks.includes(s.id));
  const blockedByOptions = others.filter((s) => !subtask.blockedBy.includes(s.id));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <span className="text-hig-footnote text-ink-secondary">Blocks:</span>
        <div className="flex flex-wrap gap-1.5">
          {subtask.blocks.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-surface-inset px-2 py-0.5 text-hig-footnote text-ink">
              {titleOf(id)}
              <button type="button" aria-label={`Remove blocks ${titleOf(id)}`} onClick={() => onRemoveLink(subtask.id, id)} className="text-ink-tertiary hover:text-ink">×</button>
            </span>
          ))}
        </div>
        <select
          aria-label="Add a sub-task this blocks"
          value=""
          onChange={(e) => { if (e.target.value) onAddLink(subtask.id, e.target.value); }}
          className="h-8 rounded-md bg-surface border border-rule text-hig-footnote text-ink px-2"
        >
          <option value="">Add…</option>
          {blocksOptions.map((s) => (<option key={s.id} value={s.id}>{s.title || "(untitled)"}</option>))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-hig-footnote text-ink-secondary">Blocked by:</span>
        <div className="flex flex-wrap gap-1.5">
          {subtask.blockedBy.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-surface-inset px-2 py-0.5 text-hig-footnote text-ink">
              {titleOf(id)}
              <button type="button" aria-label={`Remove blocked-by ${titleOf(id)}`} onClick={() => onRemoveLink(id, subtask.id)} className="text-ink-tertiary hover:text-ink">×</button>
            </span>
          ))}
        </div>
        <select
          aria-label="Add a sub-task that blocks this"
          value=""
          onChange={(e) => { if (e.target.value) onAddLink(e.target.value, subtask.id); }}
          className="h-8 rounded-md bg-surface border border-rule text-hig-footnote text-ink px-2"
        >
          <option value="">Add…</option>
          {blockedByOptions.map((s) => (<option key={s.id} value={s.id}>{s.title || "(untitled)"}</option>))}
        </select>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run** — `npm test -- tests/components/epic/SubtaskLinksField.test.tsx && npm run typecheck`. Pass.

- [ ] **Step 5: Commit**

```bash
git add components/epic/SubtaskLinksField.tsx tests/components/epic/SubtaskLinksField.test.tsx
git commit -m "feat(AI-36): SubtaskLinksField (blocks / blocked-by pickers)"
```

---

## Task 9: SubtaskCard component

**Files:** Create `components/epic/SubtaskCard.tsx`, `tests/components/epic/SubtaskCard.test.tsx`.

- [ ] **Step 1: Write the failing test** — `tests/components/epic/SubtaskCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SubtaskCard } from "@/components/epic/SubtaskCard";
import type { SubTask } from "@/lib/subtasks/types";

const st: SubTask = { id: "a", title: "Alpha", description: "desc", labels: ["x"], blocks: [], blockedBy: [] };
const base = {
  allSubtasks: [st],
  onUpdate: () => {}, onSetLabels: () => {}, onAddLink: () => {}, onRemoveLink: () => {}, onDelete: () => {},
};

describe("<SubtaskCard>", () => {
  it("reports title edits", async () => {
    const onUpdate = vi.fn();
    render(<SubtaskCard subtask={st} {...base} onUpdate={onUpdate} />);
    await userEvent.type(screen.getByLabelText(/^title/i), "!");
    expect(onUpdate).toHaveBeenLastCalledWith({ title: "Alpha!" });
  });

  it("shows a 1500-char counter and caps the description input", () => {
    render(<SubtaskCard subtask={st} {...base} />);
    const desc = screen.getByLabelText(/^description/i) as HTMLTextAreaElement;
    expect(desc.maxLength).toBe(1500);
    expect(screen.getByText(/4\s*\/\s*1500/)).toBeInTheDocument();
  });

  it("fires onDelete", async () => {
    const onDelete = vi.fn();
    render(<SubtaskCard subtask={st} {...base} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: /delete sub-task/i }));
    expect(onDelete).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npm test -- tests/components/epic/SubtaskCard.test.tsx`.

- [ ] **Step 3: Create `components/epic/SubtaskCard.tsx`:**

```tsx
"use client";

import { Button } from "@/components/ui/Button";
import { TextField, TextArea } from "@/components/ui/TextField";
import { LabelsEditor } from "@/components/epic/LabelsEditor";
import { SubtaskLinksField } from "@/components/epic/SubtaskLinksField";
import { MAX_DESCRIPTION, type SubTask } from "@/lib/subtasks/types";

type Props = {
  subtask: SubTask;
  allSubtasks: SubTask[];
  onUpdate: (patch: { title?: string; description?: string }) => void;
  onSetLabels: (labels: string[]) => void;
  onAddLink: (blockerId: string, blockedId: string) => void;
  onRemoveLink: (blockerId: string, blockedId: string) => void;
  onDelete: () => void;
};

export function SubtaskCard({ subtask, allSubtasks, onUpdate, onSetLabels, onAddLink, onRemoveLink, onDelete }: Props) {
  return (
    <div className="hig-card p-4 flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <TextField
            label="Title"
            value={subtask.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            placeholder="Sub-task title"
          />
        </div>
        <Button type="button" variant="ghost" size="sm" aria-label="Delete sub-task" onClick={onDelete}>
          Delete
        </Button>
      </div>

      <div className="flex flex-col gap-1">
        <TextArea
          label="Description"
          value={subtask.description}
          maxLength={MAX_DESCRIPTION}
          onChange={(e) => onUpdate({ description: e.target.value })}
          placeholder="What this sub-task covers"
          className="min-h-[80px]"
        />
        <span className="text-hig-caption text-ink-tertiary self-end">
          {subtask.description.length} / {MAX_DESCRIPTION}
        </span>
      </div>

      <LabelsEditor value={subtask.labels} onChange={onSetLabels} />
      <SubtaskLinksField subtask={subtask} allSubtasks={allSubtasks} onAddLink={onAddLink} onRemoveLink={onRemoveLink} />
    </div>
  );
}
```

- [ ] **Step 4: Run** — `npm test -- tests/components/epic/SubtaskCard.test.tsx && npm run typecheck`. Pass.

- [ ] **Step 5: Commit**

```bash
git add components/epic/SubtaskCard.tsx tests/components/epic/SubtaskCard.test.tsx
git commit -m "feat(AI-36): SubtaskCard (title, capped description+counter, labels, links, delete)"
```

---

## Task 10: SubtaskList component

**Files:** Create `components/epic/SubtaskList.tsx`, `tests/components/epic/SubtaskList.test.tsx`.

- [ ] **Step 1: Write the failing test** — `tests/components/epic/SubtaskList.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SubtaskList } from "@/components/epic/SubtaskList";
import type { SubTask } from "@/lib/subtasks/types";

const list: SubTask[] = [
  { id: "a", title: "Alpha", description: "", labels: [], blocks: [], blockedBy: [] },
  { id: "b", title: "Beta", description: "", labels: [], blocks: [], blockedBy: [] },
];
const handlers = { onUpdate: vi.fn(), onSetLabels: vi.fn(), onAddLink: vi.fn(), onRemoveLink: vi.fn(), onDelete: vi.fn(), onAdd: vi.fn() };

describe("<SubtaskList>", () => {
  it("renders a card per sub-task", () => {
    render(<SubtaskList subtasks={list} {...handlers} />);
    expect(screen.getByDisplayValue("Alpha")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Beta")).toBeInTheDocument();
  });

  it("fires onAdd", async () => {
    const onAdd = vi.fn();
    render(<SubtaskList subtasks={list} {...handlers} onAdd={onAdd} />);
    await userEvent.click(screen.getByRole("button", { name: /add sub-task/i }));
    expect(onAdd).toHaveBeenCalled();
  });

  it("routes per-card callbacks with the sub-task id", async () => {
    const onDelete = vi.fn();
    render(<SubtaskList subtasks={list} {...handlers} onDelete={onDelete} />);
    await userEvent.click(screen.getAllByRole("button", { name: /delete sub-task/i })[1]);
    expect(onDelete).toHaveBeenCalledWith("b");
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npm test -- tests/components/epic/SubtaskList.test.tsx`.

- [ ] **Step 3: Create `components/epic/SubtaskList.tsx`:**

```tsx
"use client";

import { Button } from "@/components/ui/Button";
import { SubtaskCard } from "@/components/epic/SubtaskCard";
import type { SubTask } from "@/lib/subtasks/types";

type Props = {
  subtasks: SubTask[];
  onUpdate: (id: string, patch: { title?: string; description?: string }) => void;
  onSetLabels: (id: string, labels: string[]) => void;
  onAddLink: (blockerId: string, blockedId: string) => void;
  onRemoveLink: (blockerId: string, blockedId: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
};

export function SubtaskList({ subtasks, onUpdate, onSetLabels, onAddLink, onRemoveLink, onDelete, onAdd }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h2 className="text-hig-title3">Sub-tasks</h2>
        <Button type="button" size="sm" variant="secondary" onClick={onAdd}>Add sub-task</Button>
      </header>
      {subtasks.map((s) => (
        <SubtaskCard
          key={s.id}
          subtask={s}
          allSubtasks={subtasks}
          onUpdate={(patch) => onUpdate(s.id, patch)}
          onSetLabels={(labels) => onSetLabels(s.id, labels)}
          onAddLink={onAddLink}
          onRemoveLink={onRemoveLink}
          onDelete={() => onDelete(s.id)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run** — `npm test -- tests/components/epic/SubtaskList.test.tsx && npm run typecheck`. Pass.

- [ ] **Step 5: Commit**

```bash
git add components/epic/SubtaskList.tsx tests/components/epic/SubtaskList.test.tsx
git commit -m "feat(AI-36): SubtaskList (cards + add sub-task)"
```

---

## Task 11: Wire generation + list into StandaloneApp (and enable Generate in KneadingPanel)

**Files:** Modify `components/epic/KneadingPanel.tsx`, `tests/components/epic/KneadingPanel.test.tsx`, `components/Editor.tsx`, `components/StandaloneApp.tsx`, `tests/components/StandaloneApp.epic.test.tsx`.

### Part A — KneadingPanel: enable Generate

- [ ] **Step 1: Update KneadingPanel test.** In `tests/components/epic/KneadingPanel.test.tsx`, replace the existing "complete state" test with one that passes an `onGenerate` and expects the button enabled + clickable:

```tsx
  it("shows the complete state with an enabled Generate sub-tasks button", async () => {
    const onGenerate = vi.fn();
    const complete: KneadState = { status: "complete", rounds: interviewing({ a: "x", b: "Low" }).rounds };
    render(<KneadingPanel {...baseProps} state={complete} onGenerate={onGenerate} />);
    expect(screen.getByText(/kneading complete/i)).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: /generate sub-tasks/i });
    expect(btn).not.toBeDisabled();
    await userEvent.click(btn);
    expect(onGenerate).toHaveBeenCalled();
  });

  it("disables Generate while generating", () => {
    const complete: KneadState = { status: "complete", rounds: interviewing({ a: "x", b: "Low" }).rounds };
    render(<KneadingPanel {...baseProps} state={complete} onGenerate={() => {}} generating />);
    expect(screen.getByRole("button", { name: /generate sub-tasks/i })).toBeDisabled();
  });
```
`onGenerate`/`generating` are new optional props — pass them per-test as shown above; leave `baseProps` unchanged.

- [ ] **Step 2: Run, expect FAIL** — `npm test -- tests/components/epic/KneadingPanel.test.tsx`.

- [ ] **Step 3: Update `components/epic/KneadingPanel.tsx`.** Add to `Props`:
```ts
  onGenerate?: () => void;
  generating?: boolean;
```
Destructure them (with `generating = false`). Replace the complete-state block's button:
```tsx
          <Button
            type="button"
            onClick={onGenerate}
            disabled={!onGenerate || generating}
            title="Generate sub-tasks from the kneaded context"
          >
            {generating ? "Generating…" : "Generate sub-tasks"}
          </Button>
```

- [ ] **Step 4: Run** — `npm test -- tests/components/epic/KneadingPanel.test.tsx && npm run typecheck`. Pass.

### Part B — Editor preserves subtasks

- [ ] **Step 5: Update Editor preservation.** In `components/Editor.tsx`, both write sites currently preserve `mode`/`knead`. Add `subtasks` to both:
- autosave effect:
```ts
  useEffect(() => {
    const existing = loadDraft(namespace);
    saveDraft(namespace, { ...draft, mode: existing.mode, knead: existing.knead, subtasks: existing.subtasks });
  }, [namespace, draft]);
```
- `flush`:
```ts
    const flush = () => {
      const existing = loadDraft(namespace);
      saveDraft(namespace, { ...draftRef.current, mode: existing.mode, knead: existing.knead, subtasks: existing.subtasks });
    };
```

### Part C — StandaloneApp wiring

- [ ] **Step 6: Add the integration test.** Append to `tests/components/StandaloneApp.epic.test.tsx` (inside the existing describe). The existing `mockKneadFetch` only handles `/api/knead`; add a sibling mock that also answers `/api/subtasks`:

```tsx
  function mockEpicFetch() {
    let kneadCalls = 0;
    return vi.fn(async (url: string) => {
      if (typeof url === "string" && url.includes("/api/jira/session")) return { ok: true, json: async () => session } as Response;
      if (typeof url === "string" && url.includes("/api/knead")) {
        kneadCalls += 1;
        const body = kneadCalls === 1
          ? { kind: "questions", round: { questions: [{ id: "a", prompt: "Risk?", section: "technical", type: "single", options: ["Low", "High"] }] } }
          : { kind: "complete" };
        return { ok: true, json: async () => body } as Response;
      }
      if (typeof url === "string" && url.includes("/api/subtasks")) {
        return { ok: true, json: async () => ({ subtasks: [
          { title: "First", description: "d", labels: ["x"], blocks: [1] },
          { title: "Second", description: "", labels: [], blocks: [] },
        ] }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });
  }

  it("generates sub-tasks after kneading completes and persists them", async () => {
    vi.stubGlobal("fetch", mockEpicFetch());
    render(<StandaloneApp initialSession={session} />);

    await userEvent.click(await screen.findByRole("button", { name: /knead tasks/i }));
    await userEvent.click(await screen.findByRole("radio", { name: "High" }));
    await userEvent.click(screen.getByRole("button", { name: /^knead$/i }));

    const generate = await screen.findByRole("button", { name: /generate sub-tasks/i });
    await userEvent.click(generate);

    expect(await screen.findByDisplayValue("First")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Second")).toBeInTheDocument();

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem("task-creator:draft:standalone") || "{}");
      expect(stored.subtasks?.length).toBe(2);
      // symmetric link from the proposal's blocks:[1]
      expect(stored.subtasks[0].blocks).toEqual([stored.subtasks[1].id]);
    });
  });
```

- [ ] **Step 6b: Fix the SP1 assertion that now flips.** The existing first test in `tests/components/StandaloneApp.epic.test.tsx` ("kneads a round … reaches Kneading complete") asserts the Generate button is **disabled**. SP2 wires `onGenerate` into the panel, so it is now **enabled**. Change that line from:
```tsx
    expect(screen.getByRole("button", { name: /generate sub-tasks/i })).toBeDisabled();
```
to:
```tsx
    expect(screen.getByRole("button", { name: /generate sub-tasks/i })).not.toBeDisabled();
```

- [ ] **Step 7: Run, expect FAIL** — `npm test -- tests/components/StandaloneApp.epic.test.tsx` (the new generation test fails; the flipped assertion should pass once Step 8 wiring lands).

- [ ] **Step 8: Wire StandaloneApp.** In `components/StandaloneApp.tsx`:

Add imports:
```ts
import { SubtaskList } from "@/components/epic/SubtaskList";
import { fromProposed, addSubtask, deleteSubtask, updateSubtask, setLabels, addLink, removeLink } from "@/lib/subtasks/state";
import type { SubTask, ProposedSubtask } from "@/lib/subtasks/types";
```

Add state (near the epic state):
```ts
  const [subtasks, setSubtasks] = useState<SubTask[]>([]);
  const [generating, setGenerating] = useState(false);
  const [subtasksError, setSubtasksError] = useState<string | null>(null);
```

In the mount hydration effect, also hydrate subtasks:
```ts
    if (d.subtasks) setSubtasks(d.subtasks);
```

Add a persistence helper (next to `persistEpic`):
```ts
  function persistSubtasks(next: SubTask[]) {
    const current = loadDraft(NAMESPACE);
    saveDraft(NAMESPACE, { ...current, subtasks: next });
  }
  function commitSubtasks(next: SubTask[]) {
    setSubtasks(next);
    persistSubtasks(next);
  }
```

Add handlers (near the kneading handlers):
```ts
  async function generateSubtasks() {
    const epicDescription = (draftRef.current?.description ?? "").replace(/<[^>]*>/g, "").trim();
    setGenerating(true);
    setSubtasksError(null);
    try {
      const res = await fetch("/api/subtasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ epicDescription, rounds: kneadRef.current.rounds }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(json.subtasks)) {
        setSubtasksError(typeof json.error === "string" ? json.error : `Request failed (${res.status}).`);
        return;
      }
      commitSubtasks(fromProposed(json.subtasks as ProposedSubtask[]));
    } catch (e) {
      setSubtasksError(e instanceof Error ? e.message : "Network error");
    } finally {
      setGenerating(false);
    }
  }
```

In `confirmReKnead`, also clear subtasks (after the existing knead reset):
```ts
    commitSubtasks([]);
```

Pass `onGenerate`/`generating` to `KneadingPanel`:
```tsx
          onGenerate={generateSubtasks}
          generating={generating}
```

Render the SubtaskList in the right pane when there are sub-tasks — change the KneadingPanel grid sibling block to choose between the list and the panel:
```tsx
      {epicMode && (mode.kind === "idle" || mode.kind === "running") && knead.status !== "idle" && (
        subtasks.length > 0 ? (
          <aside className="w-[460px] shrink-0 border-l border-rule bg-surface h-full overflow-y-auto p-5">
            {subtasksError && (
              <div className="mb-3 rounded-md bg-danger/5 border border-danger/30 px-3 py-2" role="alert">
                <p className="text-hig-footnote text-danger">{subtasksError}</p>
              </div>
            )}
            <SubtaskList
              subtasks={subtasks}
              onAdd={() => commitSubtasks(addSubtask(subtasks))}
              onDelete={(id) => commitSubtasks(deleteSubtask(subtasks, id))}
              onUpdate={(id, patch) => commitSubtasks(updateSubtask(subtasks, id, patch))}
              onSetLabels={(id, labels) => commitSubtasks(setLabels(subtasks, id, labels))}
              onAddLink={(blockerId, blockedId) => commitSubtasks(addLink(subtasks, blockerId, blockedId))}
              onRemoveLink={(blockerId, blockedId) => commitSubtasks(removeLink(subtasks, blockerId, blockedId))}
            />
          </aside>
        ) : (
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
            onGenerate={generateSubtasks}
            generating={generating}
          />
        )
      )}
```
(Keep the existing KneadingPanel props; only add `onGenerate`/`generating` and wrap in the `subtasks.length > 0 ? list : panel` conditional.)

- [ ] **Step 9: Run the integration + regressions** — `npm test -- tests/components/StandaloneApp.epic.test.tsx tests/components/epic/KneadingPanel.test.tsx tests/components/Editor.test.tsx && npm run typecheck && npm run lint`. All pass.

- [ ] **Step 10: Full suite** — `npm test`. Confirm no regressions.

- [ ] **Step 11: Commit**

```bash
git add components/epic/KneadingPanel.tsx tests/components/epic/KneadingPanel.test.tsx components/Editor.tsx components/StandaloneApp.tsx tests/components/StandaloneApp.epic.test.tsx
git commit -m "feat(AI-36): wire sub-task generation + editable list into StandaloneApp"
```

---

## Final verification
- [ ] `npm test && npm run typecheck && npm run lint` — all green.
- [ ] Manual (`npm run dev`): epic → knead → complete → Generate sub-tasks → edit titles/descriptions (counter caps at 1500), add/delete, add labels, set blocks/blocked-by between sub-tasks; reload and confirm the list persists; edit the epic description → lost-dough → confirm clears sub-tasks.

## Spec coverage map
| Spec requirement | Task |
|---|---|
| AI generates proposed sub-tasks from kneaded context | 3, 5, 6, 11 |
| Editable title + description (1500 cap + counter) | 9 |
| Add / delete / manual create | 4, 10, 11 |
| Labels per sub-task (AI-proposed + new) | 4, 5, 7, 9 |
| Blocks / is-blocked-by between sub-tasks (symmetric) | 4, 8, 9 |
| Persistence + lost-dough clears sub-tasks | 2, 11 |
| Synchronous /api/subtasks (no SSE) | 6 |
| Deterministic stub for tests | 5, 6, 11 |
| DRY: shared JSON extractor | 1 |
