# Epic Mode — Tabbed Sub-task Editor + Analyze-all — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the inline `SubtaskCard` list with a tabbed editor where each sub-task (and the epic) is edited via the full single-task `Editor`, plus an "Analyze all" button that refines every task's title/description/acceptance-criteria in one AI pass. Bake → reviewer mode is preserved.

**Architecture:** Each sub-task's editable content lives in its own per-task Editor draft (`standalone:epic:<id>`); the main draft keeps lightweight `EpicTask` descriptors (`{id,title,labels,blocks,blockedBy}`). New tab components reuse the existing `Editor` (with a `hideSubmit` prop). A new `task-refine` skill + `/api/refine` powers Analyze-all. SP3 reviewer mode is adapted to read from descriptors + per-task drafts.

**Tech Stack:** Next.js 16, React 19, TypeScript, Zod, Tailwind (HIG), nanoid, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-05-27-epic-mode-tabbed-editor-design.md`

**Conventions:** reuse `components/ui/*`, `LabelsEditor`, `SubtaskLinksField`; HIG tokens only; tests under `tests/{lib,components,api}/`; per-task `git add` ONLY that task's files; commit after each task once `npm test` + `npm run typecheck` pass.

**Scope trims (documented):** the tab Editor does NOT wire per-task **Help** or **diagrams** (Help/diagrams are tied to the main namespace / post-finalize flow; refine produces neither). Title-suggest, AC list, constraints, task type all work. Per-task Help is a future follow-up.

---

## File structure
**Create:** `lib/epic/tasks.ts`, `lib/refine/parse.ts`, `skills/task-refine/SKILL.md`, `app/api/refine/route.ts`, `components/epic/EpicTaskEditor.tsx`, `components/epic/EpicTabBar.tsx`, `components/epic/EpicTabs.tsx`, plus tests.
**Modify:** `lib/draft/autosave.ts` (`epicTasks` field; Editor preserve via this field), `lib/agent/index.ts` (`runRefine` + stub), `lib/api/schemas.ts` (`RefineBodySchema`), `components/Editor.tsx` (`hideSubmit`), `components/StandaloneApp.tsx` (generation→descriptors, tabbed render, analyze-all, add/delete, reviewer interference adapter), `components/epic/review/{ReviewNav,EpicPreview,ReviewTaskPanel,ReviewerMode}.tsx`.
**Retire (delete):** `components/epic/SubtaskCard.tsx` + test, `components/epic/SubtaskList.tsx` + test (their `LabelsEditor`/`SubtaskLinksField` live on). Keep `lib/subtasks/*` (generation parse/types still used by `/api/subtasks`).

---

## Task 1: Draft `epicTasks` field + EpicTask type

**Files:** Create `lib/epic/tasks.ts` (types only this task); Modify `lib/draft/autosave.ts`, `components/Editor.tsx` (preserve-list); Test: extend `tests/lib/draft.test.ts`.

- [ ] **Step 1: Create `lib/epic/tasks.ts` (types + constant only):**
```ts
// Lightweight ordered descriptors for an epic's sub-tasks. The editable
// content (title/description/AC/constraints/taskType) lives in each task's own
// Editor draft at namespace `standalone:epic:<id>`; `title` here is a mirror
// for tab/nav labels only. Pure — no SDK/React.
export type EpicTask = {
  id: string;
  title: string;
  labels: string[];
  blocks: string[];
  blockedBy: string[];
};

export const epicTaskNamespace = (id: string) => `standalone:epic:${id}`;
```

- [ ] **Step 2: Failing tests** — append to `tests/lib/draft.test.ts` inside the existing describe:
```ts
  it("loadDraft preserves an epicTasks array", () => {
    const epicTasks = [{ id: "t1", title: "T", labels: ["x"], blocks: [], blockedBy: [] }];
    window.localStorage.setItem("task-creator:draft:et", JSON.stringify({ title: "T", epicTasks }));
    expect(loadDraft("et").epicTasks).toEqual(epicTasks);
  });
  it("loadDraft leaves epicTasks undefined when absent", () => {
    window.localStorage.setItem("task-creator:draft:et2", JSON.stringify({ title: "T" }));
    expect(loadDraft("et2").epicTasks).toBeUndefined();
  });
```

- [ ] **Step 3: Run, expect FAIL** — `npm test -- tests/lib/draft.test.ts`.

- [ ] **Step 4: Edit `lib/draft/autosave.ts` — ADDITIVE (keep `subtasks` for now).**
- add `import type { EpicTask } from "@/lib/epic/tasks";` next to the existing `import type { SubTask } from "@/lib/subtasks/types";` (keep both).
- in `Draft`, ADD `epicTasks?: EpicTask[];` right after the existing `subtasks?: SubTask[];` (keep `subtasks`).
- in `loadDraft`'s return, ADD after the `subtasks:` line:
```ts
      epicTasks: Array.isArray(parsed.epicTasks) ? parsed.epicTasks : undefined,
```

- [ ] **Step 5: Update the Editor preserve-list — ADDITIVE.** In `components/Editor.tsx`, both `saveDraft` calls (the autosave effect ~line 79 and the `flush`) spread `subtasks: existing.subtasks`. ADD `epicTasks: existing.epicTasks` alongside it in BOTH (keep `subtasks`).

- [ ] **Step 6: Run** — `npm test -- tests/lib/draft.test.ts && npm run typecheck`. Both pass cleanly — this task is purely additive (the old `subtasks` field/components are untouched and still compile). The whole suite stays green at every task; the now-dead `subtasks` field + `SubtaskCard`/`SubtaskList` are removed only in Task 13 once nothing references them.

- [ ] **Step 7: Commit**
```bash
git add lib/epic/tasks.ts lib/draft/autosave.ts components/Editor.tsx tests/lib/draft.test.ts
git commit -m "feat(AI-36): Draft.epicTasks descriptor field (retire subtasks)"
```

---

## Task 2: Editor `hideSubmit` prop

**Files:** Modify `components/Editor.tsx`; Test: extend `tests/components/Editor.test.tsx`.

- [ ] **Step 1: Failing test** — append to `tests/components/Editor.test.tsx`:
```tsx
  it("hides the submit button when hideSubmit is set", () => {
    render(<Editor namespace="hs1" onFinalize={vi.fn()} hideSubmit />);
    expect(screen.queryByRole("button", { name: /finalize task/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /knead tasks/i })).not.toBeInTheDocument();
    // The editor fields still render.
    expect(screen.getByLabelText(/task title/i)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run, expect FAIL** — `npm test -- tests/components/Editor.test.tsx`.

- [ ] **Step 3: Add the prop.** In `components/Editor.tsx`:
- add `hideSubmit?: boolean;` to `Props`.
- add `hideSubmit = false,` to the destructured params.
- in the form `onSubmit`, short-circuit when hiding: make the first line `if (hideSubmit) return;` (so Enter can't submit).
- wrap the submit-button block (the `{mode === "epic" ? (<Knead…/>) : (<Finalize…/>)}`) in `{!hideSubmit && ( … )}`. Keep the Help button unaffected.

- [ ] **Step 4: Run** — `npm test -- tests/components/Editor.test.tsx && npm run typecheck`. Both pass.

- [ ] **Step 5: Commit**
```bash
git add components/Editor.tsx tests/components/Editor.test.tsx
git commit -m "feat(AI-36): Editor hideSubmit prop for embedded use"
```

---

## Task 3: EpicTask descriptor reducer

**Files:** Modify `lib/epic/tasks.ts` (add reducer); Test: `tests/lib/epic-tasks.test.ts`.

- [ ] **Step 1: Failing test** — `tests/lib/epic-tasks.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  newEpicTask, addEpicTask, deleteEpicTask, setTitle, setLabels,
  addLink, removeLink, descriptorsFromProposed,
} from "@/lib/epic/tasks";

describe("epic task descriptors", () => {
  it("descriptorsFromProposed assigns ids and resolves blocks indices symmetrically", () => {
    const list = descriptorsFromProposed([
      { title: "A", description: "", labels: ["x"], blocks: [1] },
      { title: "B", description: "", labels: [], blocks: [] },
    ]);
    expect(list).toHaveLength(2);
    expect(list[0].title).toBe("A");
    expect(list[0].labels).toEqual(["x"]);
    expect(list[0].blocks).toEqual([list[1].id]);
    expect(list[1].blockedBy).toEqual([list[0].id]);
  });
  it("newEpicTask makes a blank descriptor with an id", () => {
    const t = newEpicTask();
    expect(t).toMatchObject({ title: "", labels: [], blocks: [], blockedBy: [] });
    expect(t.id).toBeTruthy();
  });
  it("addEpicTask appends", () => {
    expect(addEpicTask([]).length).toBe(1);
  });
  it("deleteEpicTask removes it and strips dangling links", () => {
    let list = descriptorsFromProposed([{ title: "A", description: "", labels: [], blocks: [1] }, { title: "B", description: "", labels: [], blocks: [] }]);
    list = deleteEpicTask(list, list[1].id);
    expect(list).toHaveLength(1);
    expect(list[0].blocks).toEqual([]);
  });
  it("setTitle / setLabels (dedupe)", () => {
    let list = addEpicTask([]);
    const id = list[0].id;
    list = setTitle(list, id, "New");
    list = setLabels(list, id, ["a", "A", "b"]);
    expect(list[0].title).toBe("New");
    expect(list[0].labels).toEqual(["a", "b"]);
  });
  it("addLink symmetric + ignore self/dup; removeLink both directions", () => {
    let list = addEpicTask(addEpicTask([]));
    const [a, b] = [list[0].id, list[1].id];
    list = addLink(list, a, b);
    expect(list[0].blocks).toEqual([b]);
    expect(list[1].blockedBy).toEqual([a]);
    list = addLink(list, a, b);
    expect(list[0].blocks).toEqual([b]);
    list = addLink(list, a, a);
    expect(list[0].blocks).toEqual([b]);
    list = removeLink(list, a, b);
    expect(list[0].blocks).toEqual([]);
    expect(list[1].blockedBy).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npm test -- tests/lib/epic-tasks.test.ts`.

- [ ] **Step 3: Add the reducer to `lib/epic/tasks.ts`** (below the types):
```ts
import { nanoid } from "nanoid";
import { dedupeLabels } from "@/lib/jira/metadata";
import type { ProposedSubtask } from "@/lib/subtasks/types";
import { MAX_DESCRIPTION } from "@/lib/subtasks/types";

export function newEpicTask(): EpicTask {
  return { id: nanoid(), title: "", labels: [], blocks: [], blockedBy: [] };
}

export function addEpicTask(list: EpicTask[]): EpicTask[] {
  return [...list, newEpicTask()];
}

export function deleteEpicTask(list: EpicTask[], id: string): EpicTask[] {
  return list
    .filter((t) => t.id !== id)
    .map((t) => ({ ...t, blocks: t.blocks.filter((b) => b !== id), blockedBy: t.blockedBy.filter((b) => b !== id) }));
}

export function setTitle(list: EpicTask[], id: string, title: string): EpicTask[] {
  return list.map((t) => (t.id === id ? { ...t, title } : t));
}

export function setLabels(list: EpicTask[], id: string, labels: string[]): EpicTask[] {
  return list.map((t) => (t.id === id ? { ...t, labels: dedupeLabels(labels) } : t));
}

export function addLink(list: EpicTask[], blockerId: string, blockedId: string): EpicTask[] {
  if (blockerId === blockedId) return list;
  return list.map((t) => {
    if (t.id === blockerId) return t.blocks.includes(blockedId) ? t : { ...t, blocks: [...t.blocks, blockedId] };
    if (t.id === blockedId) return t.blockedBy.includes(blockerId) ? t : { ...t, blockedBy: [...t.blockedBy, blockerId] };
    return t;
  });
}

export function removeLink(list: EpicTask[], blockerId: string, blockedId: string): EpicTask[] {
  return list.map((t) => {
    if (t.id === blockerId) return { ...t, blocks: t.blocks.filter((b) => b !== blockedId) };
    if (t.id === blockedId) return { ...t, blockedBy: t.blockedBy.filter((b) => b !== blockerId) };
    return t;
  });
}

// Build descriptors from AI proposals (resolving 0-based blocks indices to ids,
// symmetric). The per-task draft *content* (title/description) is seeded by the
// caller via saveDraft — here we only carry the title mirror + labels/links.
export type ProposedSeed = { id: string; title: string; description: string };

export function descriptorsFromProposed(proposed: ProposedSubtask[]): EpicTask[] {
  const list: EpicTask[] = proposed.map((p) => ({
    id: nanoid(),
    title: p.title,
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

// Convenience for the caller: the seed drafts to persist per task, matched to
// the descriptors by index. (Description is clamped to MAX_DESCRIPTION.)
export function seedsFromProposed(proposed: ProposedSubtask[], descriptors: EpicTask[]): ProposedSeed[] {
  return descriptors.map((d, i) => ({ id: d.id, title: d.title, description: (proposed[i]?.description ?? "").slice(0, MAX_DESCRIPTION) }));
}
```

- [ ] **Step 4: Run** — `npm test -- tests/lib/epic-tasks.test.ts && npm run typecheck`. Both pass.

- [ ] **Step 5: Commit**
```bash
git add lib/epic/tasks.ts tests/lib/epic-tasks.test.ts
git commit -m "feat(AI-36): EpicTask descriptor reducer + fromProposed"
```

---

## Task 4: Refine response parsing

**Files:** Create `lib/refine/parse.ts`, `tests/lib/refine-parse.test.ts`.

- [ ] **Step 1: Failing test** — `tests/lib/refine-parse.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseRefineResponse } from "@/lib/refine/parse";

describe("parseRefineResponse", () => {
  it("parses title/description/acceptanceCriteria", () => {
    const r = parseRefineResponse(JSON.stringify({ title: "T", description: "D", acceptanceCriteria: ["a", "b"] }));
    expect(r).toEqual({ title: "T", description: "D", acceptanceCriteria: ["a", "b"] });
  });
  it("defaults acceptanceCriteria to [] and tolerates fences", () => {
    const r = parseRefineResponse("ok\n```json\n" + JSON.stringify({ title: "T", description: "D" }) + "\n```");
    expect(r.acceptanceCriteria).toEqual([]);
  });
  it("truncates description to 1500", () => {
    const r = parseRefineResponse(JSON.stringify({ title: "T", description: "x".repeat(2000) }));
    expect(r.description).toHaveLength(1500);
  });
  it("throws on no JSON object", () => {
    expect(() => parseRefineResponse("nope")).toThrow(/JSON/i);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npm test -- tests/lib/refine-parse.test.ts`.

- [ ] **Step 3: Create `lib/refine/parse.ts`:**
```ts
import { z } from "zod";
import { extractJsonObject } from "@/lib/json/extract";
import { MAX_DESCRIPTION } from "@/lib/subtasks/types";

const Schema = z.object({
  title: z.string(),
  description: z.string().optional().default(""),
  acceptanceCriteria: z.array(z.string()).optional().default([]),
});

export type RefineResult = { title: string; description: string; acceptanceCriteria: string[] };

export function parseRefineResponse(raw: string): RefineResult {
  const candidate = extractJsonObject(raw);
  if (!candidate) throw new Error(`refine: model output had no JSON object. First 200 chars: ${raw.slice(0, 200)}`);
  let json: unknown;
  try {
    json = JSON.parse(candidate);
  } catch {
    throw new Error(`refine: model output was not valid JSON. First 200 chars: ${candidate.slice(0, 200)}`);
  }
  const parsed = Schema.parse(json);
  return { title: parsed.title, description: parsed.description.slice(0, MAX_DESCRIPTION), acceptanceCriteria: parsed.acceptanceCriteria };
}
```

- [ ] **Step 4: Run** — `npm test -- tests/lib/refine-parse.test.ts && npm run typecheck` (module compiles in isolation).

- [ ] **Step 5: Commit**
```bash
git add lib/refine/parse.ts tests/lib/refine-parse.test.ts
git commit -m "feat(AI-36): refine response parsing"
```

---

## Task 5: task-refine skill + runRefine + stub

**Files:** Create `skills/task-refine/SKILL.md`, `tests/lib/agent-refine.test.ts`; Modify `lib/agent/index.ts`.

- [ ] **Step 1: Create `skills/task-refine/SKILL.md`:**
```markdown
---
name: task-refine
description: Improve one sub-task draft (title, description, acceptance criteria) in a single pass, given its epic context. Strict JSON output.
---

# Refine Sub-task Skill

You receive a JSON user message: the epic description and one sub-task's current draft.

```json
{
  "epicDescription": "free-form epic text",
  "draft": { "title": "...", "description": "...", "acceptanceCriteria": ["..."], "constraints": "..." }
}
```

**Output exactly one JSON object** — no markdown, no preamble, no trailing prose:

```json
{
  "title": "Sharper imperative title",
  "description": "Clearer, more specific description.",
  "acceptanceCriteria": ["Given/When/Then-style or binary checks", "..."]
}
```

**Rules:**
- Sharpen clarity and specificity within the sub-task's existing scope — do NOT invent new scope or merge in other sub-tasks.
- `title`: short, imperative.
- `description`: ≤1500 characters.
- `acceptanceCriteria`: 2–6 short, testable statements; derive them from the description if none were given.
- Respect any `constraints` the author provided.
```

- [ ] **Step 2: Failing test** — `tests/lib/agent-refine.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { runRefine, makeStubTransport } from "@/lib/agent";
import type { AgentTransport } from "@/lib/agent/types";

function textTransport(text: string): AgentTransport {
  return { async runRole({ onEvent }) { onEvent({ type: "token", text }); } };
}

describe("runRefine", () => {
  it("returns the refined draft fields", async () => {
    const reply = JSON.stringify({ title: "Better", description: "Clearer", acceptanceCriteria: ["x", "y"] });
    const r = await runRefine({ epicDescription: "E", draft: { title: "t", description: "d", acceptanceCriteria: [], constraints: "" }, transport: textTransport(reply) });
    expect(r).toEqual({ title: "Better", description: "Clearer", acceptanceCriteria: ["x", "y"] });
  });
  it("stub returns a deterministic refined draft", async () => {
    const stub = makeStubTransport();
    let buf = "";
    await stub.runRole({ role: "refine", systemPrompt: "", userMessage: "{}", cwd: process.cwd(), onEvent: (e) => { if (e.type === "token") buf += e.text; } });
    const parsed = JSON.parse(buf);
    expect(typeof parsed.title).toBe("string");
    expect(Array.isArray(parsed.acceptanceCriteria)).toBe(true);
  });
});
```

- [ ] **Step 3: Run, expect FAIL** — `npm test -- tests/lib/agent-refine.test.ts`.

- [ ] **Step 4: Edit `lib/agent/index.ts`:**
(a) imports near the other `@/lib`:
```ts
import { parseRefineResponse, type RefineResult } from "@/lib/refine/parse";
```
(b) add after `runInterferenceAnalysis`:
```ts
export async function runRefine(args: {
  epicDescription: string;
  draft: { title: string; description: string; acceptanceCriteria: string[]; constraints: string };
  transport: AgentTransport;
  signal?: AbortSignal;
}): Promise<RefineResult> {
  const systemPrompt = await loadSkillPrompt("task-refine");
  const userMessage = JSON.stringify({ epicDescription: args.epicDescription, draft: args.draft });

  let buffer = "";
  let pending: Error | null = null;
  await args.transport.runRole({
    role: "refine",
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
  return parseRefineResponse(buffer);
}
```
(c) stub branch among the others in `makeStubTransport`:
```ts
      } else if (role === "refine") {
        let title = "Refined sub-task";
        try {
          const parsed = JSON.parse(userMessage) as { draft?: { title?: string } };
          if (parsed.draft?.title) title = `${parsed.draft.title} (refined)`;
        } catch { /* ignore */ }
        onEvent({ type: "token", text: JSON.stringify({ title, description: "Refined description.", acceptanceCriteria: ["Refined AC 1", "Refined AC 2"] }) });
```

- [ ] **Step 5: Run** — `npm test -- tests/lib/agent-refine.test.ts tests/lib/agent.test.ts && npm run typecheck`.

- [ ] **Step 6: Commit**
```bash
git add skills/task-refine/SKILL.md lib/agent/index.ts tests/lib/agent-refine.test.ts
git commit -m "feat(AI-36): task-refine skill, runRefine, stub"
```

---

## Task 6: POST /api/refine route

**Files:** Modify `lib/api/schemas.ts`; Create `app/api/refine/route.ts`, `tests/api/refine.test.ts`.

- [ ] **Step 1: Add schema.** In `lib/api/schemas.ts`:
```ts
export const RefineBodySchema = z.object({
  epicDescription: z.string().min(1),
  draft: z.object({
    title: z.string(),
    description: z.string(),
    acceptanceCriteria: z.array(z.string()),
    constraints: z.string(),
  }),
});
export type RefineBody = z.infer<typeof RefineBodySchema>;
```

- [ ] **Step 2: Failing test** — `tests/api/refine.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/auth/requireSession", () => ({
  requireSession: vi.fn(async () => ({ accessToken: "t", refreshToken: "r", expiresAt: Date.now() + 3_600_000, accountId: "a", email: "e@x.com" })),
}));

import { POST } from "@/app/api/refine/route";

const body = { epicDescription: "E", draft: { title: "t", description: "d", acceptanceCriteria: [], constraints: "" } };
function makeReq(b: unknown, origin?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin) headers.origin = origin;
  return new Request("http://x/api/refine", { method: "POST", headers, body: JSON.stringify(b) });
}

describe("POST /api/refine (stub)", () => {
  const prev = process.env.TASK_AGENT_MODE;
  beforeEach(() => { process.env.TASK_AGENT_MODE = "stub"; });
  afterEach(() => { if (prev === undefined) delete process.env.TASK_AGENT_MODE; else process.env.TASK_AGENT_MODE = prev; });

  it("returns a refined draft", async () => {
    const res = await POST(makeReq(body));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(typeof json.title).toBe("string");
    expect(Array.isArray(json.acceptanceCriteria)).toBe(true);
  });
  it("400 on empty epicDescription", async () => {
    expect((await POST(makeReq({ ...body, epicDescription: "" }))).status).toBe(400);
  });
  it("400 on malformed JSON", async () => {
    const r = new Request("http://x/api/refine", { method: "POST", headers: { "content-type": "application/json" }, body: "x" });
    expect((await POST(r)).status).toBe(400);
  });
  it("403 on disallowed origin", async () => {
    process.env.TASK_EMBED_ORIGINS = "https://allowed.example";
    try { expect((await POST(makeReq(body, "https://evil.example"))).status).toBe(403); }
    finally { delete process.env.TASK_EMBED_ORIGINS; }
  });
});
```

- [ ] **Step 2b: Run, expect FAIL** — `npm test -- tests/api/refine.test.ts`.

- [ ] **Step 3: Create `app/api/refine/route.ts`** (mirror `app/api/subtasks/route.ts`):
```ts
import { NextResponse } from "next/server";
import { RefineBodySchema } from "@/lib/api/schemas";
import { makeTransport, runRefine } from "@/lib/agent";
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
  if (!isOriginAllowed(req)) return NextResponse.json({ error: "origin not allowed" }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid JSON body" }, { status: 400 }); }
  const parsed = RefineBodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

  const transport = makeTransport();
  try {
    const refined = await runRefine({ epicDescription: parsed.data.epicDescription, draft: parsed.data.draft, transport });
    return NextResponse.json(refined);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run** — `npm test -- tests/api/refine.test.ts && npm run typecheck`.

- [ ] **Step 5: Commit**
```bash
git add lib/api/schemas.ts app/api/refine/route.ts tests/api/refine.test.ts
git commit -m "feat(AI-36): POST /api/refine route"
```

---

## Task 7: EpicTaskEditor component

**Files:** Create `components/epic/EpicTaskEditor.tsx`, `tests/components/epic/EpicTaskEditor.test.tsx`.

- [ ] **Step 1: Failing test** — `tests/components/epic/EpicTaskEditor.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EpicTaskEditor } from "@/components/epic/EpicTaskEditor";
import type { EpicTask } from "@/lib/epic/tasks";

beforeEach(() => window.localStorage.clear());

const tasks: EpicTask[] = [
  { id: "a", title: "Alpha", labels: [], blocks: [], blockedBy: [] },
  { id: "b", title: "Beta", labels: [], blocks: [], blockedBy: [] },
];
const base = {
  allTasks: tasks, labels: [], blocks: [], blockedBy: [], refreshKey: 0,
  onTitleChange: () => {}, onSetLabels: () => {}, onAddLink: () => {}, onRemoveLink: () => {}, onDelete: () => {},
};

describe("<EpicTaskEditor>", () => {
  it("renders the single-task editor fields without a submit button", () => {
    render(<EpicTaskEditor taskId="a" {...base} />);
    expect(screen.getByLabelText(/task title/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /finalize task|knead tasks/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });
  it("hydrates the task's persisted draft", async () => {
    window.localStorage.setItem("task-creator:draft:standalone:epic:a", JSON.stringify({ title: "Persisted A", description: "", acceptanceCriteria: [], constraints: "" }));
    render(<EpicTaskEditor taskId="a" {...base} />);
    expect(await screen.findByDisplayValue("Persisted A")).toBeInTheDocument();
  });
  it("fires onDelete", async () => {
    const onDelete = vi.fn();
    render(<EpicTaskEditor taskId="a" {...base} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(onDelete).toHaveBeenCalled();
  });
  it("offers other tasks (not itself) as link targets", () => {
    render(<EpicTaskEditor taskId="a" {...base} />);
    const select = screen.getByLabelText(/add a sub-task this blocks/i) as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).not.toContain("a");
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npm test -- tests/components/epic/EpicTaskEditor.test.tsx`.

- [ ] **Step 3: Create `components/epic/EpicTaskEditor.tsx`:**
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
};

export function EpicTaskEditor({
  taskId, allTasks, labels, blocks, blockedBy, refreshKey,
  onTitleChange, onSetLabels, onAddLink, onRemoveLink, onDelete,
}: Props) {
  // SubtaskLinksField wants a SubTask-shaped list; the descriptors carry the
  // ids/titles/links it needs (description/labels unused for link options).
  const self: SubTask = { id: taskId, title: "", description: "", labels, blocks, blockedBy };
  const allAsSubtasks: SubTask[] = allTasks.map((t) => ({ id: t.id, title: t.title, description: "", labels: t.labels, blocks: t.blocks, blockedBy: t.blockedBy }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" aria-label="Delete task" onClick={onDelete}>Delete task</Button>
      </div>
      <Editor
        key={`${taskId}:${refreshKey}`}
        namespace={epicTaskNamespace(taskId)}
        onFinalize={() => {}}
        hideSubmit
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

- [ ] **Step 4: Run** — `npm test -- tests/components/epic/EpicTaskEditor.test.tsx && npm run typecheck`. Both pass.
Note: the `onDraftChange` fires once on mount with the empty/hydrated draft — `onTitleChange` consumers must tolerate that (StandaloneApp updates the descriptor mirror idempotently).

- [ ] **Step 5: Commit**
```bash
git add components/epic/EpicTaskEditor.tsx tests/components/epic/EpicTaskEditor.test.tsx
git commit -m "feat(AI-36): EpicTaskEditor (per-task Editor + deps/labels)"
```

---

## Task 8: EpicTabBar component

**Files:** Create `components/epic/EpicTabBar.tsx`, `tests/components/epic/EpicTabBar.test.tsx`.

- [ ] **Step 1: Failing test** — `tests/components/epic/EpicTabBar.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EpicTabBar } from "@/components/epic/EpicTabBar";

const tasks = [{ id: "a", title: "Alpha" }, { id: "b", title: "" }];

describe("<EpicTabBar>", () => {
  it("renders an Epic tab + one tab per task (untitled fallback) + an add control", () => {
    render(<EpicTabBar tasks={tasks} active="epic" onSelect={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByRole("tab", { name: /^epic$/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /alpha/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /untitled/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add (a )?task/i })).toBeInTheDocument();
  });
  it("selects a tab and adds", async () => {
    const onSelect = vi.fn(); const onAdd = vi.fn();
    render(<EpicTabBar tasks={tasks} active="epic" onSelect={onSelect} onAdd={onAdd} />);
    await userEvent.click(screen.getByRole("tab", { name: /alpha/i }));
    expect(onSelect).toHaveBeenCalledWith("a");
    await userEvent.click(screen.getByRole("button", { name: /add (a )?task/i }));
    expect(onAdd).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npm test -- tests/components/epic/EpicTabBar.test.tsx`.

- [ ] **Step 3: Create `components/epic/EpicTabBar.tsx`:**
```tsx
"use client";

type TabTask = { id: string; title: string };
type Props = {
  tasks: TabTask[];
  active: "epic" | string;
  onSelect: (tab: "epic" | string) => void;
  onAdd: () => void;
};

export function EpicTabBar({ tasks, active, onSelect, onAdd }: Props) {
  const tabClass = (selected: boolean) =>
    `px-3 h-8 rounded-t-md text-hig-footnote whitespace-nowrap border-b-2 ${
      selected ? "border-accent text-ink font-medium" : "border-transparent text-ink-secondary hover:text-ink"
    }`;
  return (
    <div role="tablist" aria-label="Epic tasks" className="flex items-center gap-1 overflow-x-auto border-b border-rule">
      <button type="button" role="tab" aria-selected={active === "epic"} className={tabClass(active === "epic")} onClick={() => onSelect("epic")}>
        Epic
      </button>
      {tasks.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={active === t.id} className={tabClass(active === t.id)} onClick={() => onSelect(t.id)}>
          {t.title.trim() || "(untitled)"}
        </button>
      ))}
      <button type="button" aria-label="Add a task" className="px-2 h-8 text-ink-secondary hover:text-ink" onClick={onAdd}>
        ＋
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run** — `npm test -- tests/components/epic/EpicTabBar.test.tsx && npm run typecheck`.

- [ ] **Step 5: Commit**
```bash
git add components/epic/EpicTabBar.tsx tests/components/epic/EpicTabBar.test.tsx
git commit -m "feat(AI-36): EpicTabBar"
```

---

## Task 9: EpicTabs component

**Files:** Create `components/epic/EpicTabs.tsx`, `tests/components/epic/EpicTabs.test.tsx`.

- [ ] **Step 1: Failing test** — `tests/components/epic/EpicTabs.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EpicTabs } from "@/components/epic/EpicTabs";
import type { EpicTask } from "@/lib/epic/tasks";

beforeEach(() => window.localStorage.clear());

const tasks: EpicTask[] = [
  { id: "a", title: "Alpha", labels: [], blocks: [], blockedBy: [] },
  { id: "b", title: "Beta", labels: [], blocks: [], blockedBy: [] },
];
const base = {
  tasks, active: "a", analyzing: false, analyzeProgress: null as string | null, refreshKey: 0,
  onSelect: vi.fn(), onAdd: vi.fn(), onAnalyzeAll: vi.fn(), onBake: vi.fn(),
  onTitleChange: vi.fn(), onSetLabels: vi.fn(), onAddLink: vi.fn(), onRemoveLink: vi.fn(), onDelete: vi.fn(),
};

describe("<EpicTabs>", () => {
  it("shows the task editor for the active task and the Analyze all + Bake toolbar", () => {
    render(<EpicTabs {...base} />);
    expect(screen.getByRole("tab", { name: /alpha/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/task title/i)).toBeInTheDocument(); // active task's Editor
    expect(screen.getByRole("button", { name: /analyze all/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^bake$/i })).toBeInTheDocument();
  });
  it("shows the epic Editor on the Epic tab", () => {
    render(<EpicTabs {...base} active="epic" />);
    expect(screen.getByLabelText(/task title/i)).toBeInTheDocument();
  });
  it("fires Analyze all and Bake", async () => {
    const onAnalyzeAll = vi.fn(); const onBake = vi.fn();
    render(<EpicTabs {...base} onAnalyzeAll={onAnalyzeAll} onBake={onBake} />);
    await userEvent.click(screen.getByRole("button", { name: /analyze all/i }));
    expect(onAnalyzeAll).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /^bake$/i }));
    expect(onBake).toHaveBeenCalled();
  });
  it("shows analyze progress and disables the button while analyzing", () => {
    render(<EpicTabs {...base} analyzing analyzeProgress="Analyzing 1/2…" />);
    expect(screen.getByText(/analyzing 1\/2/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /analyz/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npm test -- tests/components/epic/EpicTabs.test.tsx`.

- [ ] **Step 3: Create `components/epic/EpicTabs.tsx`:**
```tsx
"use client";

import { Editor } from "@/components/Editor";
import { Button } from "@/components/ui/Button";
import { EpicTabBar } from "@/components/epic/EpicTabBar";
import { EpicTaskEditor } from "@/components/epic/EpicTaskEditor";
import type { EpicTask } from "@/lib/epic/tasks";

const NAMESPACE = "standalone";

type Props = {
  tasks: EpicTask[];
  active: "epic" | string;
  analyzing: boolean;
  analyzeProgress: string | null;
  refreshKey: number;
  onSelect: (tab: "epic" | string) => void;
  onAdd: () => void;
  onAnalyzeAll: () => void;
  onBake: () => void;
  onTitleChange: (id: string, title: string) => void;
  onSetLabels: (id: string, labels: string[]) => void;
  onAddLink: (blockerId: string, blockedId: string) => void;
  onRemoveLink: (blockerId: string, blockedId: string) => void;
  onDelete: (id: string) => void;
};

export function EpicTabs(props: Props) {
  const activeTask = props.active === "epic" ? null : props.tasks.find((t) => t.id === props.active) ?? null;

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <EpicTabBar
        tasks={props.tasks.map((t) => ({ id: t.id, title: t.title }))}
        active={props.active}
        onSelect={props.onSelect}
        onAdd={props.onAdd}
      />

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={props.onAnalyzeAll} disabled={props.analyzing || props.tasks.length === 0}>
          {props.analyzing ? "Analyzing…" : "Analyze all"}
        </Button>
        <Button type="button" size="sm" onClick={props.onBake} disabled={props.analyzing || props.tasks.length === 0}>Bake</Button>
        {props.analyzeProgress && <span className="text-hig-footnote text-ink-secondary">{props.analyzeProgress}</span>}
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
          />
        ) : (
          // Epic tab — edit the epic/main task itself.
          <Editor key={`epic:${props.refreshKey}`} namespace={NAMESPACE} onFinalize={() => {}} hideSubmit />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run** — `npm test -- tests/components/epic/EpicTabs.test.tsx && npm run typecheck`.
Note: the Epic tab renders a second `Editor` on `namespace="standalone"`. That is the same draft StandaloneApp owns; the Editor preserves `mode/knead/epicTasks/reviewing/reviews` (Task 1/5) so it won't clobber epic state.

- [ ] **Step 5: Commit**
```bash
git add components/epic/EpicTabs.tsx tests/components/epic/EpicTabs.test.tsx
git commit -m "feat(AI-36): EpicTabs (tab bar + per-tab editor + analyze/bake toolbar)"
```

---

## Task 10: Wire generation + tabs into StandaloneApp

**Files:** Modify `components/StandaloneApp.tsx`; Test: `tests/components/StandaloneApp.epic.test.tsx` (replace the subtasks-list expectations).

This task swaps the SubtaskList rendering for `EpicTabs`, changes generation to create descriptors + seed per-task drafts, and adds add/delete/title-mirror/label/link handlers operating on `epicTasks`.

**Green-throughout note:** the reviewer wiring (`<ReviewerMode subtasks={subtasks}…>`, `bake()`, the review edit handlers, `confirmReKnead`'s subtask clear, `scheduleInterference`) still uses the `subtasks` state and SP2 reducers until **Task 12**. So in THIS task: KEEP the `subtasks` state and the reducers the reviewer still calls (`deleteSubtask`, `updateSubtask`, `setLabels`, `addLink`, `removeLink`, `commitSubtasks`); remove ONLY what becomes unreferenced when the SubtaskList editing surface is gone (`SubtaskList` import + its render; `fromProposed`, `addSubtask`). Do NOT touch `bake()`/reviewer here. The whole suite + typecheck + lint stay green. (Reviewer transiently renders no tasks if Baked between Tasks 10–11 because generation now fills `epicTasks` not `subtasks`; Task 12 rewires it. Not exercised by tests until Task 12.)

- [ ] **Step 1: Update imports + state.** In `components/StandaloneApp.tsx`:
- Remove `SubtaskList` and (from `lib/subtasks/state`) `fromProposed`, `addSubtask` — they become unreferenced. KEEP `commitSubtasks`, `deleteSubtask`, `updateSubtask`, `setLabels`, `addLink`, `removeLink`, the `subtasks` state, and the `SubTask` type (still used by the reviewer wiring until Task 12). Add:
```ts
import { EpicTabs } from "@/components/epic/EpicTabs";
import {
  epicTaskNamespace, descriptorsFromProposed, seedsFromProposed,
  addEpicTask, deleteEpicTask, setTitle, setLabels as setTaskLabels,
  addLink as addTaskLink, removeLink as removeTaskLink, type EpicTask,
} from "@/lib/epic/tasks";
import { loadDraft, saveDraft, clearDraft, EMPTY_DRAFT } from "@/lib/draft/autosave";
import type { ProposedSubtask } from "@/lib/subtasks/types";
```
(`clearDraft`/`EMPTY_DRAFT` may need adding to the existing `@/lib/draft/autosave` import.)
- ADD new state (alongside the existing `subtasks` state, which stays for the reviewer until Task 12):
```ts
  const [epicTasks, setEpicTasks] = useState<EpicTask[]>([]);
  const [activeTab, setActiveTab] = useState<"epic" | string>("epic");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState<string | null>(null);
  const [taskRefreshKey, setTaskRefreshKey] = useState(0);
```
- In the mount hydration effect, ADD `if (d.epicTasks) setEpicTasks(d.epicTasks);` (keep the `subtasks` hydration line).
- ADD persistence helpers (keep the existing `persistSubtasks`/`commitSubtasks`):
```ts
  function persistEpicTasks(next: EpicTask[]) {
    const current = loadDraft(NAMESPACE);
    saveDraft(NAMESPACE, { ...current, epicTasks: next });
  }
  function commitEpicTasks(next: EpicTask[]) {
    setEpicTasks(next);
    persistEpicTasks(next);
  }
```

- [ ] **Step 2: Replace `generateSubtasks` body.** Keep the fetch to `/api/subtasks`; on success, build descriptors + seed per-task drafts:
```ts
      const proposed = json.subtasks as ProposedSubtask[];
      const descriptors = descriptorsFromProposed(proposed);
      const seeds = seedsFromProposed(proposed, descriptors);
      for (const seed of seeds) {
        saveDraft(epicTaskNamespace(seed.id), {
          ...EMPTY_DRAFT,
          title: seed.title,
          description: seed.description,
        });
      }
      commitEpicTasks(descriptors);
      setActiveTab(descriptors[0]?.id ?? "epic");
```
(Leave the loading/error handling around it as-is.)

- [ ] **Step 3: Add task handlers** (near the old subtask handlers):
```ts
  function addTask() {
    const next = addEpicTask(epicTasks);
    const created = next[next.length - 1];
    saveDraft(epicTaskNamespace(created.id), { ...EMPTY_DRAFT });
    commitEpicTasks(next);
    setActiveTab(created.id);
  }
  function deleteTask(id: string) {
    clearDraft(epicTaskNamespace(id));
    const next = deleteEpicTask(epicTasks, id);
    commitEpicTasks(next);
    setReviews((prev) => { const m = { ...prev }; delete m[id]; persistReview(reviewing, m); return m; });
    setInterference((prev) => { const m = { ...prev }; delete m[id]; return m; });
    if (activeTab === id) setActiveTab(next[0]?.id ?? "epic");
  }
  function taskTitleChange(id: string, title: string) {
    // Mirror the per-task draft title into the descriptor (idempotent).
    setEpicTasks((prev) => {
      if (prev.find((t) => t.id === id)?.title === title) return prev;
      const next = setTitle(prev, id, title);
      persistEpicTasks(next);
      return next;
    });
  }
  function taskSetLabels(id: string, labels: string[]) { commitEpicTasks(setTaskLabels(epicTasks, id, labels)); }
  function taskAddLink(a: string, b: string) { commitEpicTasks(addTaskLink(epicTasks, a, b)); }
  function taskRemoveLink(a: string, b: string) { commitEpicTasks(removeTaskLink(epicTasks, a, b)); }
```
(If `persistReview` takes `(reviewing, reviews)` per SP3, the call above matches; adjust to the actual signature.)

- [ ] **Step 4: Replace the render block.** Where the epic right-pane currently does `subtasks.length > 0 ? <aside><SubtaskList…/></aside> : <KneadingPanel…/>`, change to: when `epicTasks.length > 0` (and not reviewing) render `EpicTabs` IN THE LEFT/MAIN column (it's a full editor, not a sidebar) replacing the Editor; otherwise the KneadingPanel sidebar as before. Concretely, in the idle/running left-column area, extend the existing `epicMode && reviewing ? <ReviewerMode/> : <Editor/>` conditional to a three-way:
```tsx
            {epicMode && reviewing ? (
              <ReviewerMode … />            /* unchanged */
            ) : epicMode && epicTasks.length > 0 ? (
              <EpicTabs
                tasks={epicTasks}
                active={activeTab}
                analyzing={analyzing}
                analyzeProgress={analyzeProgress}
                refreshKey={taskRefreshKey}
                onSelect={setActiveTab}
                onAdd={addTask}
                onAnalyzeAll={analyzeAll}
                onBake={bake}
                onTitleChange={taskTitleChange}
                onSetLabels={taskSetLabels}
                onAddLink={taskAddLink}
                onRemoveLink={taskRemoveLink}
                onDelete={deleteTask}
              />
            ) : (
              /* existing Editor + submitErr banner JSX */
            )}
```
- Update the right-pane KneadingPanel block condition to also hide once tabs are showing: `epicMode && !reviewing && epicTasks.length === 0 && (mode.kind === "idle" || mode.kind === "running") && knead.status !== "idle"` — so the KneadingPanel (which holds "Generate sub-tasks") shows until generation, then `EpicTabs` takes over the main column. (`analyzeAll` is implemented in Task 11; for this task, pass a temporary `onAnalyzeAll={() => {}}` and replace it in Task 11. Mark with a comment.)
- Leave `bake()` and the `<ReviewerMode>` wiring UNCHANGED here — Task 12 rewires them to `epicTasks` together with the reviewer components (keeps both tasks green).
- `confirmReKnead`: ADD clearing the epic tasks + their drafts (keep the existing `commitSubtasks([])`):
```ts
    for (const t of epicTasks) clearDraft(epicTaskNamespace(t.id));
    commitEpicTasks([]);
    setActiveTab("epic");
```

- [ ] **Step 5: Update the integration test.** In `tests/components/StandaloneApp.epic.test.tsx`, the existing "generates sub-tasks…" test expected `getByDisplayValue("First")` from a SubtaskCard title input. With tabs, after Generate the first task tab is active and its Editor shows the seeded title in the **task title** field. Update that test's assertions:
```tsx
    await userEvent.click(await screen.findByRole("button", { name: /generate sub-tasks/i }));
    // First task tab active → its Editor title field shows the seeded title.
    expect(await screen.findByDisplayValue("First")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /second/i })).toBeInTheDocument();
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem("task-creator:draft:standalone") || "{}");
      expect(stored.epicTasks?.length).toBe(2);
    });
    // The per-task draft was seeded.
    const taskDraft = JSON.parse(localStorage.getItem(`task-creator:draft:standalone:epic:${JSON.parse(localStorage.getItem("task-creator:draft:standalone")!).epicTasks[0].id}`)!);
    expect(taskDraft.title).toBe("First");
```
Also fix the existing "bake…" test: it earlier relied on `stored.subtasks`; change to `stored.epicTasks` and to reach Bake it must first Generate (tabs) then click **Bake** in the EpicTabs toolbar (`getByRole("button",{name:/^bake$/i})`).

- [ ] **Step 6: Run** — `npm test && npm run typecheck && npm run lint`. All green (the old `subtasks`/reviewer code still compiles and is exercised by its existing tests; the new tabs path is covered by the updated integration test).

- [ ] **Step 7: Commit**
```bash
git add components/StandaloneApp.tsx tests/components/StandaloneApp.epic.test.tsx
git commit -m "feat(AI-36): generation -> descriptors + tabbed editor in StandaloneApp"
```

---

## Task 11: Analyze all (sequential refine)

**Files:** Modify `components/StandaloneApp.tsx`; Test: extend `tests/components/StandaloneApp.epic.test.tsx`.

- [ ] **Step 1: Failing test** — append to the epic describe in `tests/components/StandaloneApp.epic.test.tsx`. Extend the fetch mock to answer `/api/refine` (returning an improved draft per task), then:
```tsx
  it("Analyze all refines every task's draft sequentially", async () => {
    vi.stubGlobal("fetch", mockReviewFetch()); // ensure this mock also handles /api/refine (see below)
    render(<StandaloneApp initialSession={session} />);
    await userEvent.click(await screen.findByRole("button", { name: /knead tasks/i }));
    await userEvent.click(await screen.findByRole("radio", { name: "High" }));
    await userEvent.click(screen.getByRole("button", { name: /^knead$/i }));
    await userEvent.click(await screen.findByRole("button", { name: /generate sub-tasks/i }));
    await screen.findByDisplayValue("First");

    await userEvent.click(screen.getByRole("button", { name: /analyze all/i }));

    // After analysis, each task's persisted draft has refined fields.
    await waitFor(() => {
      const std = JSON.parse(localStorage.getItem("task-creator:draft:standalone")!);
      const t0 = JSON.parse(localStorage.getItem(`task-creator:draft:standalone:epic:${std.epicTasks[0].id}`)!);
      expect(t0.acceptanceCriteria.length).toBeGreaterThan(0);
      expect(t0.title).toMatch(/refined/i);
    });
  });
```
Add to `mockReviewFetch` (in this test file) a branch:
```tsx
      if (typeof url === "string" && url.includes("/api/refine")) {
        const b = JSON.parse(String(init?.body ?? "{}"));
        return { ok: true, json: async () => ({ title: `${b.draft?.title ?? "Task"} refined`, description: "Refined.", acceptanceCriteria: ["AC1", "AC2"] }) } as unknown as Response;
      }
```

- [ ] **Step 2: Run, expect FAIL** — `npm test -- tests/components/StandaloneApp.epic.test.tsx`.

- [ ] **Step 3: Implement `analyzeAll`** in StandaloneApp (replace the Task-10 placeholder `onAnalyzeAll={() => {}}` with `onAnalyzeAll={analyzeAll}`):
```ts
  async function analyzeAll() {
    const epicDescription = (draftRef.current?.description ?? "").replace(/<[^>]*>/g, "").trim();
    setAnalyzing(true);
    setSubmitErr(null);
    try {
      const tasks = epicTasks;
      for (let i = 0; i < tasks.length; i++) {
        setAnalyzeProgress(`Analyzing ${i + 1}/${tasks.length}…`);
        const ns = epicTaskNamespace(tasks[i].id);
        const d = loadDraft(ns);
        const res = await fetch("/api/refine", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            epicDescription,
            draft: { title: d.title, description: d.description, acceptanceCriteria: d.acceptanceCriteria, constraints: d.constraints },
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || typeof json.title !== "string") {
          setSubmitErr(typeof json.error === "string" ? json.error : `Refine failed for task ${i + 1}.`);
          break;
        }
        saveDraft(ns, { ...d, title: json.title, description: json.description, acceptanceCriteria: json.acceptanceCriteria });
        setEpicTasks((prev) => { const next = setTitle(prev, tasks[i].id, json.title); persistEpicTasks(next); return next; });
      }
    } catch (e) {
      setSubmitErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setAnalyzing(false);
      setAnalyzeProgress(null);
      setTaskRefreshKey((k) => k + 1); // re-hydrate the visible Editor with refined content
    }
  }
```

- [ ] **Step 4: Run** — `npm test -- tests/components/StandaloneApp.epic.test.tsx && npm run typecheck`.

- [ ] **Step 5: Commit**
```bash
git add components/StandaloneApp.tsx tests/components/StandaloneApp.epic.test.tsx
git commit -m "feat(AI-36): Analyze all — sequential per-task refine"
```

---

## Task 12: Adapt reviewer mode (SP3) to the descriptor model

**Files:** Modify `components/epic/review/{ReviewNav,EpicPreview,ReviewTaskPanel,ReviewerMode}.tsx`, `components/StandaloneApp.tsx` (reviewer wiring + interference adapter); Tests: update the SP3 component tests + `tests/components/StandaloneApp.epic.test.tsx`.

- [ ] **Step 1: ReviewNav + EpicPreview type swap.** These only read `.id` and `.title`. Change their `subtasks: SubTask[]` props to `tasks: EpicTask[]` (import `EpicTask` from `@/lib/epic/tasks`), rename the prop usages, and update their tests' fixtures to `EpicTask` objects (drop `description`). Run each test file; fix references.

- [ ] **Step 2: ReviewTaskPanel uses EpicTaskEditor.** Replace its `SubtaskCard` with `EpicTaskEditor`. New props:
```tsx
type Props = {
  task: EpicTask;
  allTasks: EpicTask[];
  review: SubtaskReview;
  warning?: InterferenceWarning;
  refreshKey: number;
  onTitleChange: (title: string) => void;
  onSetLabels: (labels: string[]) => void;
  onAddLink: (blockerId: string, blockedId: string) => void;
  onRemoveLink: (blockerId: string, blockedId: string) => void;
  onReviewChange: (patch: Partial<SubtaskReview>) => void;
  onDelete: () => void;
};
```
Body: the warning banner (unchanged) + `<EpicTaskEditor taskId={task.id} allTasks={allTasks} labels={task.labels} blocks={task.blocks} blockedBy={task.blockedBy} refreshKey={refreshKey} onTitleChange onSetLabels onAddLink onRemoveLink onDelete />` + the `ReviewControls` card. Update its test to pass an `EpicTask` + the new props and assert the editor title field + Approve button render.

- [ ] **Step 3: ReviewerMode.** Change `subtasks: SubTask[]` → `tasks: EpicTask[]`; pass `tasks` to `ReviewNav`/`EpicPreview`; render `ReviewTaskPanel` (keyed by `task.id`) for the selected task with the new props (add a `refreshKey` prop threaded from StandaloneApp). Update its test fixtures/props.

- [ ] **Step 4: StandaloneApp reviewer wiring.** Update the `<ReviewerMode>` usage: pass `tasks={epicTasks}`, `refreshKey={taskRefreshKey}`, and review/edit handlers that operate on descriptors + per-task drafts:
  - `onUpdate`/edit now flow through `EpicTaskEditor` (per-task Editor autosaves itself); so ReviewerMode's editing handlers reduce to `onTitleChange=taskTitleChange`, `onSetLabels=taskSetLabels`, `onAddLink=taskAddLink`, `onRemoveLink=taskRemoveLink`, `onDelete=deleteTask`, `onReviewChange=changeReview`.
  - **Interference adapter:** in `scheduleInterference`, build the lite task objects from descriptors + drafts:
```ts
    const all = epicTasks.map((t) => { const d = loadDraft(epicTaskNamespace(t.id)); return { id: t.id, title: d.title, description: d.description, labels: t.labels, blocks: t.blocks, blockedBy: t.blockedBy }; });
    const edited = all.find((s) => s.id === editedId);
```
  (The `/api/interference` `SubTaskSchema` already accepts these fields.) `scheduleInterference` is now triggered from the per-task edit handlers — since the per-task Editor autosaves directly, add an `onDraftChange`-driven trigger: in reviewer mode, `EpicTaskEditor.onTitleChange` (or a new `onContentChange`) calls `scheduleInterference(task.id)`. Simplest: have `taskTitleChange` also `scheduleInterference(id)` when `reviewing`.
  - **Remove the now-dead `subtasks` code from StandaloneApp:** the `subtasks` state, `persistSubtasks`/`commitSubtasks`, the old review edit handlers that called the SP2 subtask reducers, and the `lib/subtasks/state` reducer imports (`commitSubtasks`/`deleteSubtask`/`updateSubtask`/`setLabels`/`addLink`/`removeLink`/`SubTask`) — the reviewer now operates on `epicTasks` + per-task drafts. (`deleteTask`/`taskSetLabels`/`taskAddLink`/`taskRemoveLink` from Task 10 are the replacements.)

- [ ] **Step 5: Update `tests/components/StandaloneApp.epic.test.tsx`** bake/interference test to the tabs flow: Generate → **Bake** (from EpicTabs) → reviewer renders → Approve persists to `reviews` → editing the selected task's title triggers an interference warning on the other task. Adjust selectors (the reviewer now shows the per-task Editor's title field, not a SubtaskCard).

- [ ] **Step 6: Run** — `npm test -- tests/components/epic/review tests/components/StandaloneApp.epic.test.tsx && npm run typecheck`. All pass.

- [ ] **Step 7: Commit**
```bash
git add components/epic/review/ components/StandaloneApp.tsx tests/components/epic/review/ tests/components/StandaloneApp.epic.test.tsx
git commit -m "feat(AI-36): adapt reviewer mode to EpicTask descriptors + per-task editor"
```

---

## Task 13: Retire SubtaskCard/SubtaskList + final green

**Files:** Delete `components/epic/SubtaskCard.tsx`, `components/epic/SubtaskList.tsx`, `tests/components/epic/SubtaskCard.test.tsx`, `tests/components/epic/SubtaskList.test.tsx`. Keep `lib/subtasks/{types,parse}.ts` (used by `/api/subtasks` generation) and `lib/subtasks/state.ts` only if still imported — otherwise delete it too.

- [ ] **Step 1: Grep for remaining references.** Run `git grep -n "SubtaskCard\|SubtaskList\|lib/subtasks/state\|\\.subtasks\b"` and confirm nothing in `app/`, `components/`, `lib/` (outside tests) still imports them. `lib/subtasks/state.ts` (the SP2 SubTask reducer) is superseded by `lib/epic/tasks.ts`; if unreferenced, delete it + its test `tests/lib/subtasks-state.test.ts`.

- [ ] **Step 2: Delete the retired files:**
```bash
git rm components/epic/SubtaskCard.tsx components/epic/SubtaskList.tsx tests/components/epic/SubtaskCard.test.tsx tests/components/epic/SubtaskList.test.tsx
# if unreferenced:
git rm lib/subtasks/state.ts tests/lib/subtasks-state.test.ts
```

- [ ] **Step 2b: Remove the dead `subtasks` Draft field.** In `lib/draft/autosave.ts`: delete `subtasks?: SubTask[];` from `Draft`, delete its line in `loadDraft`, and drop the `import type { SubTask }` if now unused. In `components/Editor.tsx`: remove `subtasks: existing.subtasks` from BOTH `saveDraft` preserve-lists (keep `epicTasks: existing.epicTasks`). Update `tests/lib/draft.test.ts` if any case asserted `subtasks` round-trips (remove those — `epicTasks` cases added in Task 1 cover it).

- [ ] **Step 3: Full green.** Run `npm test && npm run typecheck && npm run lint`. Fix any straggler imports/types. The whole suite must pass (no remaining `subtasks` field references; `epicTasks` everywhere).

- [ ] **Step 4: Commit**
```bash
git add -A
git commit -m "refactor(AI-36): retire SubtaskCard/SubtaskList list editing surface"
```

---

## Final verification
- [ ] `npm test && npm run typecheck && npm run lint` — all green.
- [ ] Manual (`npm run dev`): epic → knead → Generate → tabs appear (Epic + per task); edit a task in the full editor (title-suggest, AC, constraints, task type); add/delete a task; switch tabs (content persists); **Analyze all** refines each (progress shown, AC populated); **Bake** → reviewer mode works (statuses/assignee/interference, editing via the same per-task editor); reload persists; re-knead clears tasks + their drafts.

## Spec coverage map
| Spec requirement | Task |
|---|---|
| `epicTasks` descriptors + per-task namespaced drafts | 1, 3, 10 |
| Editor reused per tab; no Finalize/Knead button here | 2, 7, 9 |
| Tab strip (Epic + per task + add) | 8, 9 |
| Per-task labels + blocks/blocked-by strip | 7, 3 |
| Generation seeds drafts + descriptors | 10 |
| Analyze all = sequential refine (title/desc/AC) | 4, 5, 6, 11 |
| Bake → reviewer mode reads per-task drafts; edit via same editor | 12 |
| Interference adapter (descriptors + drafts) | 12 |
| Re-knead clears tasks + drafts; lost-dough only pre-generation | 10 |
| Retire SubtaskCard/SubtaskList | 13 |
| Deterministic stubs; e2e skipped | 5, 6, 11 |
