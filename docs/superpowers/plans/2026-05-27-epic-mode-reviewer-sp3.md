# Epic Mode SP3 — Bake + Reviewer Mode + Interference — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A Bake action transitions the sub-task list into a reviewer mode with per-task status (pending/approved/denied/change-requested), comments, free-text assignee, status-colored navigation, an epic preview, and an AI interference analysis that warns about other tasks affected by an edit (never auto-editing).

**Architecture:** Pure logic in `lib/review/` + `lib/interference/`; a `task-interference` skill + `runInterferenceAnalysis` + synchronous `POST /api/interference`; React components under `components/epic/review/`; wired into `StandaloneApp`. Reviewer state persists in the draft; interference is transient. Finalize/batch-upload and diagram-from-tasks are SP4 (placeholders here). Stub transport keeps tests offline.

**Spec:** `docs/superpowers/specs/2026-05-27-epic-mode-reviewer-sp3-design.md`

**Conventions:** reuse `components/ui/{Button,TextField}` and SP2's `SubtaskCard`; HIG tokens only (`success`/`danger`/`warning` for status colors); tests under `tests/{lib,components,api}/`; commit after each task once `npm test` + `npm run typecheck` pass; per-task `git add` ONLY that task's files.

---

## File structure
**Create:** `lib/review/types.ts`, `lib/review/state.ts`, `lib/interference/parse.ts`, `skills/task-interference/SKILL.md`, `app/api/interference/route.ts`, `components/epic/review/{ReviewControls,ReviewNav,EpicPreview,ReviewTaskPanel,ReviewerMode}.tsx`, plus tests.
**Modify:** `lib/draft/autosave.ts` (`reviewing`/`reviews`), `lib/agent/index.ts` (`runInterferenceAnalysis` + stub), `lib/api/schemas.ts` (`InterferenceBodySchema`), `components/epic/SubtaskList.tsx` (Bake button), `components/Editor.tsx` (preserve `reviewing`/`reviews`), `components/StandaloneApp.tsx` (bake + reviewer wiring).

---

## Task 1: Review types + Draft fields

**Files:** Create `lib/review/types.ts`; Modify `lib/draft/autosave.ts`; Test: extend `tests/lib/draft.test.ts`.

- [ ] **Step 1: Create `lib/review/types.ts`:**
```ts
// Pure types for per-task review + interference. No SDK/React.
export type ReviewStatus = "pending" | "approved" | "denied" | "change_requested";

export type SubtaskReview = {
  status: ReviewStatus;
  comment: string;
  assignee: string | null;
};

export type ReviewMap = Record<string, SubtaskReview>; // keyed by sub-task id

export const EMPTY_REVIEW: SubtaskReview = { status: "pending", comment: "", assignee: null };

export type InterferenceWarning = { affectedTaskId: string; sourceTaskId: string; reason: string };
export type InterferenceMap = Record<string, InterferenceWarning>; // keyed by affectedTaskId
```

- [ ] **Step 2: Failing tests** — append to `tests/lib/draft.test.ts` inside the existing describe:
```ts
  it("loadDraft preserves reviewing + reviews", () => {
    const reviews = { s1: { status: "approved", comment: "", assignee: null } };
    window.localStorage.setItem("task-creator:draft:rv", JSON.stringify({ title: "T", reviewing: true, reviews }));
    const d = loadDraft("rv");
    expect(d.reviewing).toBe(true);
    expect(d.reviews).toEqual(reviews);
  });
  it("loadDraft defaults reviewing to false/undefined when absent", () => {
    window.localStorage.setItem("task-creator:draft:rv2", JSON.stringify({ title: "T" }));
    expect(loadDraft("rv2").reviewing).toBeFalsy();
  });
```

- [ ] **Step 3: Run, expect FAIL** — `npm test -- tests/lib/draft.test.ts`.

- [ ] **Step 4: Edit `lib/draft/autosave.ts`:**
- add `import type { ReviewMap } from "@/lib/review/types";`
- add to `Draft` after `subtasks?`:
```ts
  reviewing?: boolean;
  reviews?: ReviewMap;
```
- in `loadDraft`'s try-block return add:
```ts
      reviewing: parsed.reviewing === true,
      reviews: parsed.reviews && typeof parsed.reviews === "object" ? parsed.reviews : undefined,
```

- [ ] **Step 5: Run** — `npm test -- tests/lib/draft.test.ts && npm run typecheck`. Pass.

- [ ] **Step 6: Commit**
```bash
git add lib/review/types.ts lib/draft/autosave.ts tests/lib/draft.test.ts
git commit -m "feat(AI-36): review types + Draft reviewing/reviews fields"
```

---

## Task 2: Review reducer (pure)

**Files:** Create `lib/review/state.ts`, `tests/lib/review-state.test.ts`.

- [ ] **Step 1: Failing test** — `tests/lib/review-state.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { getReview, setReview, initReviews, pruneReviews, allReviewed } from "@/lib/review/state";
import { EMPTY_REVIEW } from "@/lib/review/types";

describe("review reducer", () => {
  it("getReview returns EMPTY_REVIEW for unknown id", () => {
    expect(getReview({}, "x")).toEqual(EMPTY_REVIEW);
  });
  it("setReview patches one id without touching others", () => {
    const m = setReview({ a: { status: "approved", comment: "", assignee: null } }, "b", { status: "denied" });
    expect(m.a.status).toBe("approved");
    expect(m.b).toEqual({ status: "denied", comment: "", assignee: null });
  });
  it("setReview merges into existing entry", () => {
    let m = setReview({}, "a", { status: "change_requested", comment: "fix" });
    m = setReview(m, "a", { assignee: "sam" });
    expect(m.a).toEqual({ status: "change_requested", comment: "fix", assignee: "sam" });
  });
  it("initReviews adds pending entries for new ids and keeps existing", () => {
    const m = initReviews(["a", "b"], { a: { status: "approved", comment: "", assignee: null } });
    expect(m.a.status).toBe("approved");
    expect(m.b).toEqual(EMPTY_REVIEW);
  });
  it("pruneReviews drops entries not in validIds", () => {
    const m = pruneReviews({ a: EMPTY_REVIEW, b: EMPTY_REVIEW }, ["a"]);
    expect(Object.keys(m)).toEqual(["a"]);
  });
  it("allReviewed is true only when every id is approved or denied", () => {
    const m = { a: { status: "approved", comment: "", assignee: null }, b: { status: "denied", comment: "", assignee: null } };
    expect(allReviewed(["a", "b"], m)).toBe(true);
    expect(allReviewed(["a", "b"], { ...m, b: EMPTY_REVIEW })).toBe(false);
    expect(allReviewed([], m)).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npm test -- tests/lib/review-state.test.ts`.

- [ ] **Step 3: Create `lib/review/state.ts`:**
```ts
import { type ReviewMap, type SubtaskReview, EMPTY_REVIEW } from "./types";

export function getReview(map: ReviewMap, id: string): SubtaskReview {
  return map[id] ?? EMPTY_REVIEW;
}

export function setReview(map: ReviewMap, id: string, patch: Partial<SubtaskReview>): ReviewMap {
  return { ...map, [id]: { ...getReview(map, id), ...patch } };
}

export function initReviews(ids: string[], existing: ReviewMap = {}): ReviewMap {
  const out: ReviewMap = {};
  for (const id of ids) out[id] = existing[id] ?? { ...EMPTY_REVIEW };
  return out;
}

export function pruneReviews(map: ReviewMap, validIds: string[]): ReviewMap {
  const valid = new Set(validIds);
  const out: ReviewMap = {};
  for (const [id, review] of Object.entries(map)) if (valid.has(id)) out[id] = review;
  return out;
}

export function allReviewed(ids: string[], map: ReviewMap): boolean {
  if (ids.length === 0) return false;
  return ids.every((id) => {
    const s = getReview(map, id).status;
    return s === "approved" || s === "denied";
  });
}
```

- [ ] **Step 4: Run** — `npm test -- tests/lib/review-state.test.ts && npm run typecheck`. Pass.

- [ ] **Step 5: Commit**
```bash
git add lib/review/state.ts tests/lib/review-state.test.ts
git commit -m "feat(AI-36): review state reducer"
```

---

## Task 3: Interference response parsing (pure)

**Files:** Create `lib/interference/parse.ts`, `tests/lib/interference-parse.test.ts`.

- [ ] **Step 1: Failing test** — `tests/lib/interference-parse.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseInterferenceResponse } from "@/lib/interference/parse";

describe("parseInterferenceResponse", () => {
  it("parses warnings", () => {
    const r = parseInterferenceResponse(JSON.stringify({ interference: [{ affectedTaskId: "b", reason: "shares the same API" }] }));
    expect(r).toEqual([{ affectedTaskId: "b", reason: "shares the same API" }]);
  });
  it("defaults to empty array when interference is missing", () => {
    expect(parseInterferenceResponse(JSON.stringify({}))).toEqual([]);
  });
  it("tolerates fences/prose", () => {
    const r = parseInterferenceResponse("ok\n```json\n" + JSON.stringify({ interference: [] }) + "\n```");
    expect(r).toEqual([]);
  });
  it("drops malformed warnings (missing reason)", () => {
    const r = parseInterferenceResponse(JSON.stringify({ interference: [{ affectedTaskId: "b" }, { affectedTaskId: "c", reason: "x" }] }));
    expect(r).toEqual([{ affectedTaskId: "c", reason: "x" }]);
  });
  it("throws when no JSON object", () => {
    expect(() => parseInterferenceResponse("nope")).toThrow(/JSON/i);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npm test -- tests/lib/interference-parse.test.ts`.

- [ ] **Step 3: Create `lib/interference/parse.ts`:**
```ts
import { z } from "zod";
import { extractJsonObject } from "@/lib/json/extract";

const WarningSchema = z.object({ affectedTaskId: z.string().min(1), reason: z.string().min(1) });

export type RawWarning = z.infer<typeof WarningSchema>;

export function parseInterferenceResponse(raw: string): RawWarning[] {
  const candidate = extractJsonObject(raw);
  if (!candidate) throw new Error(`interference: model output had no JSON object. First 200 chars: ${raw.slice(0, 200)}`);
  let json: unknown;
  try {
    json = JSON.parse(candidate);
  } catch {
    throw new Error(`interference: model output was not valid JSON. First 200 chars: ${candidate.slice(0, 200)}`);
  }
  const arr = (json as { interference?: unknown }).interference;
  if (!Array.isArray(arr)) return [];
  // Drop malformed items rather than failing the whole analysis.
  return arr.flatMap((item) => {
    const parsed = WarningSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}
```

- [ ] **Step 4: Run** — `npm test -- tests/lib/interference-parse.test.ts && npm run typecheck`. Pass.

- [ ] **Step 5: Commit**
```bash
git add lib/interference/parse.ts tests/lib/interference-parse.test.ts
git commit -m "feat(AI-36): interference response parsing"
```

---

## Task 4: task-interference skill + runInterferenceAnalysis + stub

**Files:** Create `skills/task-interference/SKILL.md`, `tests/lib/agent-interference.test.ts`; Modify `lib/agent/index.ts`.

- [ ] **Step 1: Create `skills/task-interference/SKILL.md`:**
```markdown
---
name: task-interference
description: Analyze whether editing one sub-task may affect other sub-tasks in the same epic. Strict JSON output.
---

# Interference Analysis Skill

You receive a JSON user message: an epic description, the sub-task that was just edited, and all
sub-tasks in the epic:

```json
{
  "epicDescription": "free-form epic text",
  "editedSubtask": { "id": "t1", "title": "...", "description": "...", "labels": [], "blocks": [], "blockedBy": [] },
  "allSubtasks": [ { "id": "t1", "...": "..." }, { "id": "t2", "...": "..." } ]
}
```

**Output exactly one JSON object** — no markdown, no preamble, no trailing prose:

```json
{
  "interference": [
    { "affectedTaskId": "t2", "reason": "Both touch the auth middleware; the new scope here changes its contract." }
  ]
}
```

**Rules:**
- Only flag OTHER sub-tasks (never `editedSubtask.id`) that may need revisiting because of the edit.
- `affectedTaskId` MUST be the id of a sub-task present in `allSubtasks`.
- `reason` is one short sentence explaining the potential impact.
- If nothing is affected, return `{ "interference": [] }`.
- Never propose edits — only surface advisory warnings.
```

- [ ] **Step 2: Failing test** — `tests/lib/agent-interference.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { runInterferenceAnalysis, makeStubTransport } from "@/lib/agent";
import type { AgentTransport } from "@/lib/agent/types";
import type { SubTask } from "@/lib/subtasks/types";

const a: SubTask = { id: "a", title: "A", description: "", labels: [], blocks: [], blockedBy: [] };
const b: SubTask = { id: "b", title: "B", description: "", labels: [], blocks: [], blockedBy: [] };

function textTransport(text: string): AgentTransport {
  return { async runRole({ onEvent }) { onEvent({ type: "token", text }); } };
}

describe("runInterferenceAnalysis", () => {
  it("returns warnings stamped with sourceTaskId, filtering unknown/self", async () => {
    const reply = JSON.stringify({ interference: [
      { affectedTaskId: "b", reason: "shares API" },
      { affectedTaskId: "a", reason: "self - should be dropped" },
      { affectedTaskId: "zzz", reason: "unknown - dropped" },
    ] });
    const r = await runInterferenceAnalysis({ epicDescription: "E", editedSubtask: a, allSubtasks: [a, b], transport: textTransport(reply) });
    expect(r).toEqual([{ affectedTaskId: "b", sourceTaskId: "a", reason: "shares API" }]);
  });

  it("stub flags the first other task", async () => {
    const stub = makeStubTransport();
    let buf = "";
    await stub.runRole({
      role: "interference", systemPrompt: "", cwd: process.cwd(),
      userMessage: JSON.stringify({ editedSubtask: a, allSubtasks: [a, b] }),
      onEvent: (e) => { if (e.type === "token") buf += e.text; },
    });
    const parsed = JSON.parse(buf);
    expect(parsed.interference[0].affectedTaskId).toBe("b");
  });
});
```

- [ ] **Step 3: Run, expect FAIL** — `npm test -- tests/lib/agent-interference.test.ts`.

- [ ] **Step 4: Edit `lib/agent/index.ts`:**
(a) imports near other `@/lib`:
```ts
import { parseInterferenceResponse } from "@/lib/interference/parse";
import type { SubTask } from "@/lib/subtasks/types";
import type { InterferenceWarning } from "@/lib/review/types";
```
(b) add after `runGenerateSubtasks`:
```ts
export async function runInterferenceAnalysis(args: {
  epicDescription: string;
  editedSubtask: SubTask;
  allSubtasks: SubTask[];
  transport: AgentTransport;
  signal?: AbortSignal;
}): Promise<InterferenceWarning[]> {
  const systemPrompt = await loadSkillPrompt("task-interference");
  const userMessage = JSON.stringify({
    epicDescription: args.epicDescription,
    editedSubtask: args.editedSubtask,
    allSubtasks: args.allSubtasks,
  });

  let buffer = "";
  let pending: Error | null = null;
  await args.transport.runRole({
    role: "interference",
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

  const validIds = new Set(args.allSubtasks.map((s) => s.id));
  return parseInterferenceResponse(buffer)
    .filter((w) => w.affectedTaskId !== args.editedSubtask.id && validIds.has(w.affectedTaskId))
    .map((w) => ({ affectedTaskId: w.affectedTaskId, sourceTaskId: args.editedSubtask.id, reason: w.reason }));
}
```
(c) stub branch alongside the others:
```ts
      } else if (role === "interference") {
        let interference: Array<{ affectedTaskId: string; reason: string }> = [];
        try {
          const parsed = JSON.parse(userMessage) as { editedSubtask?: { id?: string; title?: string }; allSubtasks?: Array<{ id: string }> };
          const other = (parsed.allSubtasks ?? []).find((s) => s.id !== parsed.editedSubtask?.id);
          if (other) interference = [{ affectedTaskId: other.id, reason: `May be affected by changes to "${parsed.editedSubtask?.title ?? "a task"}".` }];
        } catch {
          /* ignore — empty interference */
        }
        onEvent({ type: "token", text: JSON.stringify({ interference }) });
```

- [ ] **Step 5: Run** — `npm test -- tests/lib/agent-interference.test.ts tests/lib/agent.test.ts && npm run typecheck`. Pass.

- [ ] **Step 6: Commit**
```bash
git add skills/task-interference/SKILL.md lib/agent/index.ts tests/lib/agent-interference.test.ts
git commit -m "feat(AI-36): interference skill, runInterferenceAnalysis, stub"
```

---

## Task 5: POST /api/interference route

**Files:** Modify `lib/api/schemas.ts`; Create `app/api/interference/route.ts`, `tests/api/interference.test.ts`.

- [ ] **Step 1: Add schema.** In `lib/api/schemas.ts` add:
```ts
const SubTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  labels: z.array(z.string()),
  blocks: z.array(z.string()),
  blockedBy: z.array(z.string()),
});

export const InterferenceBodySchema = z.object({
  epicDescription: z.string().min(1),
  editedSubtask: SubTaskSchema,
  allSubtasks: z.array(SubTaskSchema),
});
export type InterferenceBody = z.infer<typeof InterferenceBodySchema>;
```

- [ ] **Step 2: Failing test** — `tests/api/interference.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/auth/requireSession", () => ({
  requireSession: vi.fn(async () => ({ accessToken: "t", refreshToken: "r", expiresAt: Date.now() + 3_600_000, accountId: "a", email: "e@x.com" })),
}));

import { POST } from "@/app/api/interference/route";

const st = (id: string) => ({ id, title: id, description: "", labels: [], blocks: [], blockedBy: [] });
function makeReq(body: unknown, origin?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin) headers.origin = origin;
  return new Request("http://x/api/interference", { method: "POST", headers, body: JSON.stringify(body) });
}

describe("POST /api/interference (stub)", () => {
  const prev = process.env.TASK_AGENT_MODE;
  beforeEach(() => { process.env.TASK_AGENT_MODE = "stub"; });
  afterEach(() => { if (prev === undefined) delete process.env.TASK_AGENT_MODE; else process.env.TASK_AGENT_MODE = prev; });

  it("returns interference warnings", async () => {
    const res = await POST(makeReq({ epicDescription: "E", editedSubtask: st("a"), allSubtasks: [st("a"), st("b")] }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.interference[0].affectedTaskId).toBe("b");
    expect(json.interference[0].sourceTaskId).toBe("a");
  });

  it("400 on empty epicDescription", async () => {
    expect((await POST(makeReq({ epicDescription: "", editedSubtask: st("a"), allSubtasks: [] }))).status).toBe(400);
  });

  it("400 on malformed JSON", async () => {
    const r = new Request("http://x/api/interference", { method: "POST", headers: { "content-type": "application/json" }, body: "x" });
    expect((await POST(r)).status).toBe(400);
  });

  it("403 on disallowed origin", async () => {
    process.env.TASK_EMBED_ORIGINS = "https://allowed.example";
    try {
      expect((await POST(makeReq({ epicDescription: "E", editedSubtask: st("a"), allSubtasks: [] }, "https://evil.example"))).status).toBe(403);
    } finally { delete process.env.TASK_EMBED_ORIGINS; }
  });
});
```

- [ ] **Step 3: Run, expect FAIL** — `npm test -- tests/api/interference.test.ts`.

- [ ] **Step 4: Create `app/api/interference/route.ts`** (mirror `app/api/subtasks/route.ts`):
```ts
import { NextResponse } from "next/server";
import { InterferenceBodySchema } from "@/lib/api/schemas";
import { makeTransport, runInterferenceAnalysis } from "@/lib/agent";
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
  const parsed = InterferenceBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const transport = makeTransport();
  try {
    const interference = await runInterferenceAnalysis({
      epicDescription: parsed.data.epicDescription,
      editedSubtask: parsed.data.editedSubtask,
      allSubtasks: parsed.data.allSubtasks,
      transport,
    });
    return NextResponse.json({ interference });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
```

- [ ] **Step 5: Run** — `npm test -- tests/api/interference.test.ts && npm run typecheck`. Pass.

- [ ] **Step 6: Commit**
```bash
git add lib/api/schemas.ts app/api/interference/route.ts tests/api/interference.test.ts
git commit -m "feat(AI-36): POST /api/interference route"
```

---

## Task 6: ReviewControls component

**Files:** Create `components/epic/review/ReviewControls.tsx`, `tests/components/epic/review/ReviewControls.test.tsx`. (`components/epic/review/` and `tests/components/epic/review/` are new — create them.)

- [ ] **Step 1: Failing test** — `tests/components/epic/review/ReviewControls.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReviewControls } from "@/components/epic/review/ReviewControls";
import { EMPTY_REVIEW } from "@/lib/review/types";

describe("<ReviewControls>", () => {
  it("approves immediately", async () => {
    const onChange = vi.fn();
    render(<ReviewControls review={EMPTY_REVIEW} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /^approve$/i }));
    expect(onChange).toHaveBeenCalledWith({ status: "approved" });
  });
  it("denies immediately", async () => {
    const onChange = vi.fn();
    render(<ReviewControls review={EMPTY_REVIEW} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /^deny$/i }));
    expect(onChange).toHaveBeenCalledWith({ status: "denied" });
  });
  it("requires a comment before applying change-requested", async () => {
    const onChange = vi.fn();
    render(<ReviewControls review={EMPTY_REVIEW} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /change requested/i }));
    const apply = screen.getByRole("button", { name: /apply change request/i });
    expect(apply).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/comment/i), "please fix X");
    expect(screen.getByRole("button", { name: /apply change request/i })).not.toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /apply change request/i }));
    expect(onChange).toHaveBeenCalledWith({ status: "change_requested", comment: "please fix X" });
  });
  it("edits the assignee", async () => {
    const onChange = vi.fn();
    render(<ReviewControls review={EMPTY_REVIEW} onChange={onChange} />);
    await userEvent.type(screen.getByLabelText(/assignee/i), "sam");
    expect(onChange).toHaveBeenLastCalledWith({ assignee: "sam" });
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npm test -- tests/components/epic/review/ReviewControls.test.tsx`.

- [ ] **Step 3: Create `components/epic/review/ReviewControls.tsx`:**
```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField, TextArea } from "@/components/ui/TextField";
import type { SubtaskReview } from "@/lib/review/types";

type Props = { review: SubtaskReview; onChange: (patch: Partial<SubtaskReview>) => void };

export function ReviewControls({ review, onChange }: Props) {
  const [requesting, setRequesting] = useState(false);
  const [draftComment, setDraftComment] = useState(review.comment);

  function applyChangeRequested() {
    const c = draftComment.trim();
    if (!c) return;
    onChange({ status: "change_requested", comment: c });
    setRequesting(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Button type="button" size="sm" variant={review.status === "approved" ? "primary" : "secondary"} onClick={() => { setRequesting(false); onChange({ status: "approved" }); }}>Approve</Button>
        <Button type="button" size="sm" variant={review.status === "denied" ? "danger" : "secondary"} onClick={() => { setRequesting(false); onChange({ status: "denied" }); }}>Deny</Button>
        <Button type="button" size="sm" variant={review.status === "change_requested" ? "primary" : "secondary"} onClick={() => setRequesting(true)}>Change requested</Button>
      </div>

      {requesting && (
        <div className="flex flex-col gap-2 rounded-md bg-warning-tint border border-warning/40 p-2">
          <TextArea label="Comment (required)" value={draftComment} onChange={(e) => setDraftComment(e.target.value)} className="min-h-[60px]" />
          <div>
            <Button type="button" size="sm" onClick={applyChangeRequested} disabled={!draftComment.trim()}>Apply change request</Button>
          </div>
        </div>
      )}

      {!requesting && review.comment && (
        <p className="text-hig-footnote text-ink-secondary">Comment: {review.comment}</p>
      )}

      <TextField
        label="Assignee"
        value={review.assignee ?? ""}
        onChange={(e) => onChange({ assignee: e.target.value || null })}
        placeholder="name or email"
      />
    </div>
  );
}
```

- [ ] **Step 4: Run** — `npm test -- tests/components/epic/review/ReviewControls.test.tsx && npm run typecheck`. Pass. (If `getByLabelText(/comment/i)` collides with anything, it won't — only the TextArea has that label.)

- [ ] **Step 5: Commit**
```bash
git add components/epic/review/ReviewControls.tsx tests/components/epic/review/ReviewControls.test.tsx
git commit -m "feat(AI-36): ReviewControls (status + required comment + assignee)"
```

---

## Task 7: ReviewNav component

**Files:** Create `components/epic/review/ReviewNav.tsx`, `tests/components/epic/review/ReviewNav.test.tsx`.

- [ ] **Step 1: Failing test** — `tests/components/epic/review/ReviewNav.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReviewNav } from "@/components/epic/review/ReviewNav";
import type { SubTask } from "@/lib/subtasks/types";

const subtasks: SubTask[] = [
  { id: "a", title: "Alpha", description: "", labels: [], blocks: [], blockedBy: [] },
  { id: "b", title: "Beta", description: "", labels: [], blocks: [], blockedBy: [] },
];
const reviews = {
  a: { status: "approved" as const, comment: "", assignee: null },
  b: { status: "change_requested" as const, comment: "fix", assignee: null },
};

describe("<ReviewNav>", () => {
  it("renders an Epic entry and a colored entry per task", () => {
    render(<ReviewNav subtasks={subtasks} reviews={reviews} selectedId={null} onSelect={vi.fn()} interference={{}} />);
    expect(screen.getByRole("button", { name: /^epic$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /alpha/i }).className).toMatch(/success/);
    expect(screen.getByRole("button", { name: /beta/i }).className).toMatch(/warning/);
  });
  it("selects the epic and a task", async () => {
    const onSelect = vi.fn();
    render(<ReviewNav subtasks={subtasks} reviews={reviews} selectedId={null} onSelect={onSelect} interference={{}} />);
    await userEvent.click(screen.getByRole("button", { name: /^epic$/i }));
    expect(onSelect).toHaveBeenCalledWith(null);
    await userEvent.click(screen.getByRole("button", { name: /beta/i }));
    expect(onSelect).toHaveBeenCalledWith("b");
  });
  it("marks tasks with an interference warning", () => {
    render(<ReviewNav subtasks={subtasks} reviews={reviews} selectedId={null} onSelect={vi.fn()} interference={{ a: { affectedTaskId: "a", sourceTaskId: "b", reason: "x" } }} />);
    expect(screen.getByLabelText(/interference warning/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npm test -- tests/components/epic/review/ReviewNav.test.tsx`.

- [ ] **Step 3: Create `components/epic/review/ReviewNav.tsx`:**
```tsx
"use client";

import { getReview } from "@/lib/review/state";
import type { SubTask } from "@/lib/subtasks/types";
import type { ReviewMap, ReviewStatus, InterferenceMap } from "@/lib/review/types";

const STATUS_CLASS: Record<ReviewStatus, string> = {
  approved: "border-success text-success",
  denied: "border-danger text-danger",
  change_requested: "border-warning text-warning",
  pending: "border-rule text-ink-secondary",
};

type Props = {
  subtasks: SubTask[];
  reviews: ReviewMap;
  selectedId: string | null; // null = epic
  onSelect: (id: string | null) => void;
  interference: InterferenceMap;
};

export function ReviewNav({ subtasks, reviews, selectedId, onSelect, interference }: Props) {
  return (
    <nav aria-label="Review navigation" className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-current={selectedId === null}
        className={`text-left px-2 py-1 rounded text-hig-footnote ${selectedId === null ? "bg-surface-inset" : ""}`}
      >
        Epic
      </button>
      {subtasks.map((s) => {
        const status = getReview(reviews, s.id).status;
        const warned = Boolean(interference[s.id]);
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            aria-current={selectedId === s.id}
            className={`text-left px-2 py-1 rounded border-l-2 text-hig-footnote ${STATUS_CLASS[status]} ${selectedId === s.id ? "bg-surface-inset" : ""}`}
          >
            {s.title || "(untitled)"}
            {warned && <span aria-label="interference warning" title="Possible interference" className="ml-1 text-warning">⚠</span>}
          </button>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: Run** — `npm test -- tests/components/epic/review/ReviewNav.test.tsx && npm run typecheck`. Pass.

- [ ] **Step 5: Commit**
```bash
git add components/epic/review/ReviewNav.tsx tests/components/epic/review/ReviewNav.test.tsx
git commit -m "feat(AI-36): ReviewNav (status-colored task navigation)"
```

---

## Task 8: EpicPreview component

**Files:** Create `components/epic/review/EpicPreview.tsx`, `tests/components/epic/review/EpicPreview.test.tsx`.

- [ ] **Step 1: Failing test** — `tests/components/epic/review/EpicPreview.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EpicPreview } from "@/components/epic/review/EpicPreview";
import type { SubTask } from "@/lib/subtasks/types";

const subtasks: SubTask[] = [
  { id: "a", title: "Alpha", description: "", labels: [], blocks: [], blockedBy: [] },
  { id: "b", title: "Beta", description: "", labels: [], blocks: [], blockedBy: [] },
];

describe("<EpicPreview>", () => {
  it("renders the title, description html, and task titles", () => {
    render(<EpicPreview title="My Epic" descriptionHtml="<p>Hello <strong>world</strong></p>" subtasks={subtasks} />);
    expect(screen.getByText("My Epic")).toBeInTheDocument();
    expect(screen.getByText("world")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText(/tasks \(2\)/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npm test -- tests/components/epic/review/EpicPreview.test.tsx`.

- [ ] **Step 3: Create `components/epic/review/EpicPreview.tsx`:**
```tsx
"use client";

import type { SubTask } from "@/lib/subtasks/types";

type Props = { title: string; descriptionHtml: string; subtasks: SubTask[] };

export function EpicPreview({ title, descriptionHtml, subtasks }: Props) {
  return (
    <section aria-label="Epic preview" className="flex flex-col gap-3">
      <h2 className="text-hig-title3">{title || "(untitled epic)"}</h2>
      <div className="tiptap-prose text-hig-body text-ink" dangerouslySetInnerHTML={{ __html: descriptionHtml }} />
      <div>
        <h3 className="hig-section-label">Tasks ({subtasks.length})</h3>
        <ul className="list-disc ml-5">
          {subtasks.map((s) => (
            <li key={s.id} className="text-hig-footnote text-ink-secondary">{s.title || "(untitled)"}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run** — `npm test -- tests/components/epic/review/EpicPreview.test.tsx && npm run typecheck`. Pass.

- [ ] **Step 5: Commit**
```bash
git add components/epic/review/EpicPreview.tsx tests/components/epic/review/EpicPreview.test.tsx
git commit -m "feat(AI-36): EpicPreview (read-only epic overview)"
```

---

## Task 9: ReviewTaskPanel component

**Files:** Create `components/epic/review/ReviewTaskPanel.tsx`, `tests/components/epic/review/ReviewTaskPanel.test.tsx`.

- [ ] **Step 1: Failing test** — `tests/components/epic/review/ReviewTaskPanel.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReviewTaskPanel } from "@/components/epic/review/ReviewTaskPanel";
import { EMPTY_REVIEW } from "@/lib/review/types";
import type { SubTask } from "@/lib/subtasks/types";

const st: SubTask = { id: "a", title: "Alpha", description: "d", labels: [], blocks: [], blockedBy: [] };
const base = {
  allSubtasks: [st],
  review: EMPTY_REVIEW,
  onUpdate: () => {}, onSetLabels: () => {}, onAddLink: () => {}, onRemoveLink: () => {}, onReviewChange: () => {}, onDelete: () => {},
};

describe("<ReviewTaskPanel>", () => {
  it("renders the editable card (title) and review controls", () => {
    render(<ReviewTaskPanel subtask={st} {...base} />);
    expect(screen.getByDisplayValue("Alpha")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^approve$/i })).toBeInTheDocument();
  });
  it("shows an interference warning banner when warning is set", () => {
    render(<ReviewTaskPanel subtask={st} {...base} warning={{ affectedTaskId: "a", sourceTaskId: "b", reason: "shares the auth layer" }} />);
    expect(screen.getByText(/shares the auth layer/i)).toBeInTheDocument();
  });
  it("routes review changes", async () => {
    const onReviewChange = vi.fn();
    render(<ReviewTaskPanel subtask={st} {...base} onReviewChange={onReviewChange} />);
    await userEvent.click(screen.getByRole("button", { name: /^approve$/i }));
    expect(onReviewChange).toHaveBeenCalledWith({ status: "approved" });
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npm test -- tests/components/epic/review/ReviewTaskPanel.test.tsx`.

- [ ] **Step 3: Create `components/epic/review/ReviewTaskPanel.tsx`:**
```tsx
"use client";

import { SubtaskCard } from "@/components/epic/SubtaskCard";
import { ReviewControls } from "@/components/epic/review/ReviewControls";
import type { SubTask } from "@/lib/subtasks/types";
import type { SubtaskReview, InterferenceWarning } from "@/lib/review/types";

type Props = {
  subtask: SubTask;
  allSubtasks: SubTask[];
  review: SubtaskReview;
  warning?: InterferenceWarning;
  onUpdate: (patch: { title?: string; description?: string }) => void;
  onSetLabels: (labels: string[]) => void;
  onAddLink: (blockerId: string, blockedId: string) => void;
  onRemoveLink: (blockerId: string, blockedId: string) => void;
  onReviewChange: (patch: Partial<SubtaskReview>) => void;
  onDelete: () => void;
};

export function ReviewTaskPanel({
  subtask, allSubtasks, review, warning, onUpdate, onSetLabels, onAddLink, onRemoveLink, onReviewChange, onDelete,
}: Props) {
  return (
    <div className="flex flex-col gap-4">
      {warning && (
        <div className="rounded-md bg-warning-tint border border-warning/40 px-3 py-2" role="alert">
          <p className="text-hig-footnote text-ink">Possible interference: {warning.reason}</p>
        </div>
      )}
      <SubtaskCard
        subtask={subtask}
        allSubtasks={allSubtasks}
        onUpdate={onUpdate}
        onSetLabels={onSetLabels}
        onAddLink={onAddLink}
        onRemoveLink={onRemoveLink}
        onDelete={onDelete}
      />
      <div className="hig-card p-4">
        <h3 className="hig-section-label mb-2">Review</h3>
        <ReviewControls review={review} onChange={onReviewChange} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run** — `npm test -- tests/components/epic/review/ReviewTaskPanel.test.tsx && npm run typecheck`. Pass.

- [ ] **Step 5: Commit**
```bash
git add components/epic/review/ReviewTaskPanel.tsx tests/components/epic/review/ReviewTaskPanel.test.tsx
git commit -m "feat(AI-36): ReviewTaskPanel (editable card + review controls + warning)"
```

---

## Task 10: ReviewerMode component

**Files:** Create `components/epic/review/ReviewerMode.tsx`, `tests/components/epic/review/ReviewerMode.test.tsx`.

- [ ] **Step 1: Failing test** — `tests/components/epic/review/ReviewerMode.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReviewerMode } from "@/components/epic/review/ReviewerMode";
import { initReviews } from "@/lib/review/state";
import type { SubTask } from "@/lib/subtasks/types";

const subtasks: SubTask[] = [
  { id: "a", title: "Alpha", description: "", labels: [], blocks: [], blockedBy: [] },
  { id: "b", title: "Beta", description: "", labels: [], blocks: [], blockedBy: [] },
];
const base = {
  epicTitle: "My Epic", epicDescriptionHtml: "<p>desc</p>", subtasks,
  reviews: initReviews(["a", "b"]), interference: {},
  onSelect: vi.fn(), onEditTasks: vi.fn(), onUpdate: vi.fn(), onSetLabels: vi.fn(),
  onAddLink: vi.fn(), onRemoveLink: vi.fn(), onReviewChange: vi.fn(), onDelete: vi.fn(),
};

describe("<ReviewerMode>", () => {
  it("renders epic preview, nav, a disabled Finalize, and the selected task panel", () => {
    render(<ReviewerMode {...base} selectedId="a" />);
    expect(screen.getByText("My Epic")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: /review navigation/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /finalize/i })).toBeDisabled();
    // selected task "a" panel shows its title input
    expect(screen.getByDisplayValue("Alpha")).toBeInTheDocument();
  });
  it("shows a placeholder when nothing is selected", () => {
    render(<ReviewerMode {...base} selectedId={null} />);
    expect(screen.getByText(/select a task/i)).toBeInTheDocument();
  });
  it("fires onEditTasks", async () => {
    const onEditTasks = vi.fn();
    render(<ReviewerMode {...base} selectedId="a" onEditTasks={onEditTasks} />);
    await userEvent.click(screen.getByRole("button", { name: /edit tasks/i }));
    expect(onEditTasks).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npm test -- tests/components/epic/review/ReviewerMode.test.tsx`.

- [ ] **Step 3: Create `components/epic/review/ReviewerMode.tsx`:**
```tsx
"use client";

import { Button } from "@/components/ui/Button";
import { EpicPreview } from "@/components/epic/review/EpicPreview";
import { ReviewNav } from "@/components/epic/review/ReviewNav";
import { ReviewTaskPanel } from "@/components/epic/review/ReviewTaskPanel";
import { getReview } from "@/lib/review/state";
import type { SubTask } from "@/lib/subtasks/types";
import type { ReviewMap, InterferenceMap, SubtaskReview } from "@/lib/review/types";

type Props = {
  epicTitle: string;
  epicDescriptionHtml: string;
  subtasks: SubTask[];
  reviews: ReviewMap;
  interference: InterferenceMap;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onEditTasks: () => void;
  onUpdate: (id: string, patch: { title?: string; description?: string }) => void;
  onSetLabels: (id: string, labels: string[]) => void;
  onAddLink: (blockerId: string, blockedId: string) => void;
  onRemoveLink: (blockerId: string, blockedId: string) => void;
  onReviewChange: (id: string, patch: Partial<SubtaskReview>) => void;
  onDelete: (id: string) => void;
};

export function ReviewerMode(props: Props) {
  const selected = props.subtasks.find((s) => s.id === props.selectedId) ?? null;

  return (
    <div className="flex-1 min-h-0 flex">
      <aside className="w-[320px] shrink-0 border-r border-rule bg-surface overflow-y-auto p-4 flex flex-col gap-4">
        <EpicPreview title={props.epicTitle} descriptionHtml={props.epicDescriptionHtml} subtasks={props.subtasks} />
        <ReviewNav
          subtasks={props.subtasks}
          reviews={props.reviews}
          selectedId={props.selectedId}
          onSelect={props.onSelect}
          interference={props.interference}
        />
        <div>
          <h3 className="hig-section-label">Diagrams</h3>
          <p className="text-hig-footnote text-ink-tertiary">Diagram from tasks arrives in a later phase.</p>
        </div>
        <div className="mt-auto flex flex-col gap-2 pt-2 border-t border-rule">
          <Button type="button" disabled title="You need to review all the tasks and resolve requested changes">
            Finalize
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={props.onEditTasks}>Edit tasks</Button>
        </div>
      </aside>

      <div className="flex-1 min-h-0 overflow-y-auto p-5">
        {selected ? (
          <ReviewTaskPanel
            subtask={selected}
            allSubtasks={props.subtasks}
            review={getReview(props.reviews, selected.id)}
            warning={props.interference[selected.id]}
            onUpdate={(patch) => props.onUpdate(selected.id, patch)}
            onSetLabels={(labels) => props.onSetLabels(selected.id, labels)}
            onAddLink={props.onAddLink}
            onRemoveLink={props.onRemoveLink}
            onReviewChange={(patch) => props.onReviewChange(selected.id, patch)}
            onDelete={() => props.onDelete(selected.id)}
          />
        ) : (
          <p className="text-hig-body text-ink-secondary">Select a task from the navigation to review it.</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run** — `npm test -- tests/components/epic/review/ReviewerMode.test.tsx && npm run typecheck`. Pass.

- [ ] **Step 5: Commit**
```bash
git add components/epic/review/ReviewerMode.tsx tests/components/epic/review/ReviewerMode.test.tsx
git commit -m "feat(AI-36): ReviewerMode layout (nav + preview + diagrams placeholder + finalize seam)"
```

---

## Task 11: Bake button in SubtaskList

**Files:** Modify `components/epic/SubtaskList.tsx`, `tests/components/epic/SubtaskList.test.tsx`.

- [ ] **Step 1: Update the test.** In `tests/components/epic/SubtaskList.test.tsx`, add `onBake: vi.fn()` to the shared `handlers` object, and add this test:
```tsx
  it("fires onBake", async () => {
    const onBake = vi.fn();
    render(<SubtaskList subtasks={list} {...handlers} onBake={onBake} />);
    await userEvent.click(screen.getByRole("button", { name: /^bake$/i }));
    expect(onBake).toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run, expect FAIL** — `npm test -- tests/components/epic/SubtaskList.test.tsx`.

- [ ] **Step 3: Edit `components/epic/SubtaskList.tsx`.** Add `onBake: () => void;` to `Props`, destructure it, and add a Bake button in the header next to "Add sub-task":
```tsx
      <header className="flex items-center justify-between">
        <h2 className="text-hig-title3">Sub-tasks</h2>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={onAdd}>Add sub-task</Button>
          <Button type="button" size="sm" onClick={onBake} disabled={subtasks.length === 0}>Bake</Button>
        </div>
      </header>
```

- [ ] **Step 4: Run** — `npm test -- tests/components/epic/SubtaskList.test.tsx && npm run typecheck`. Pass.

- [ ] **Step 5: Commit**
```bash
git add components/epic/SubtaskList.tsx tests/components/epic/SubtaskList.test.tsx
git commit -m "feat(AI-36): Bake button in SubtaskList"
```

---

## Task 12: Wire bake + reviewer mode into StandaloneApp

**Files:** Modify `components/Editor.tsx`, `components/StandaloneApp.tsx`, `tests/components/StandaloneApp.epic.test.tsx`.

### Part A — Editor preserves reviewing/reviews
- [ ] **Step 1:** In `components/Editor.tsx`, add `reviewing`/`reviews` to BOTH preserve sites (the autosave effect and `flush`), e.g.:
```ts
saveDraft(namespace, { ...draft, mode: existing.mode, knead: existing.knead, subtasks: existing.subtasks, reviewing: existing.reviewing, reviews: existing.reviews });
```
(and the `flush` variant with `...draftRef.current`).

### Part B — StandaloneApp wiring
- [ ] **Step 2: Add the integration test** to `tests/components/StandaloneApp.epic.test.tsx` (inside the existing describe). Extend the `mockEpicFetch` from the SP2 test (or add a new mock) to also answer `/api/interference`:
```tsx
  function mockReviewFetch() {
    let kneadCalls = 0;
    return vi.fn(async (url: string, init?: RequestInit) => {
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
          { title: "First", description: "d", labels: [], blocks: [] },
          { title: "Second", description: "", labels: [], blocks: [] },
        ] }) } as Response;
      }
      if (typeof url === "string" && url.includes("/api/interference")) {
        const reqBody = JSON.parse(String(init?.body ?? "{}"));
        const editedId = reqBody.editedSubtask?.id;
        const other = (reqBody.allSubtasks ?? []).find((s: { id: string }) => s.id !== editedId);
        return { ok: true, json: async () => ({ interference: other ? [{ affectedTaskId: other.id, sourceTaskId: editedId, reason: "shares scope" }] : [] }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });
  }

  it("bakes into reviewer mode, sets a status, and persists reviews", async () => {
    vi.stubGlobal("fetch", mockReviewFetch());
    render(<StandaloneApp initialSession={session} />);

    await userEvent.click(await screen.findByRole("button", { name: /knead tasks/i }));
    await userEvent.click(await screen.findByRole("radio", { name: "High" }));
    await userEvent.click(screen.getByRole("button", { name: /^knead$/i }));
    await userEvent.click(await screen.findByRole("button", { name: /generate sub-tasks/i }));
    await screen.findByDisplayValue("First");

    await userEvent.click(screen.getByRole("button", { name: /^bake$/i }));

    // Reviewer mode: nav + disabled Finalize; first task selected by default.
    expect(await screen.findByRole("navigation", { name: /review navigation/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /finalize/i })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: /^approve$/i }));

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem("task-creator:draft:standalone") || "{}");
      expect(stored.reviewing).toBe(true);
      const firstId = stored.subtasks[0].id;
      expect(stored.reviews[firstId].status).toBe("approved");
    });

    // Editing the selected task triggers debounced interference → warning on the other task.
    await userEvent.type(screen.getByDisplayValue("First"), " X");
    expect(await screen.findByLabelText(/interference warning/i)).toBeInTheDocument();
  });
```

- [ ] **Step 3: Run, expect FAIL** — `npm test -- tests/components/StandaloneApp.epic.test.tsx`.

- [ ] **Step 4: Wire `components/StandaloneApp.tsx`.**
Add imports:
```ts
import { ReviewerMode } from "@/components/epic/review/ReviewerMode";
import { getReview, setReview, initReviews, pruneReviews } from "@/lib/review/state";
import type { ReviewMap, InterferenceMap, SubtaskReview } from "@/lib/review/types";
```
Add state near the subtask state:
```ts
  const [reviewing, setReviewing] = useState(false);
  const [reviews, setReviews] = useState<ReviewMap>({});
  const [interference, setInterference] = useState<InterferenceMap>({});
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const interferenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
```
In the mount hydration effect add:
```ts
    if (d.reviewing) setReviewing(true);
    if (d.reviews) setReviews(d.reviews);
```
Add a persistence helper next to `persistSubtasks`:
```ts
  function persistReview(nextReviewing: boolean, nextReviews: ReviewMap) {
    const current = loadDraft(NAMESPACE);
    saveDraft(NAMESPACE, { ...current, reviewing: nextReviewing, reviews: nextReviews });
  }
```
Add handlers (near the subtask handlers):
```ts
  function bake() {
    const ids = subtasks.map((s) => s.id);
    const next = initReviews(ids, reviews);
    setReviews(next);
    setReviewing(true);
    setSelectedReviewId(ids[0] ?? null);
    persistReview(true, next);
  }

  function exitReview() {
    setReviewing(false);
    persistReview(false, reviews);
  }

  function changeReview(id: string, patch: Partial<SubtaskReview>) {
    setReviews((prev) => {
      const next = setReview(prev, id, patch);
      persistReview(true, next);
      return next;
    });
  }

  function scheduleInterference(editedId: string) {
    if (interferenceTimer.current) clearTimeout(interferenceTimer.current);
    interferenceTimer.current = setTimeout(async () => {
      const all = (loadDraft(NAMESPACE).subtasks ?? []);
      const edited = all.find((s) => s.id === editedId);
      if (!edited) return;
      try {
        const res = await fetch("/api/interference", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            epicDescription: (draftRef.current?.description ?? "").replace(/<[^>]*>/g, "").trim(),
            editedSubtask: edited,
            allSubtasks: all,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(json.interference)) {
          const map: InterferenceMap = {};
          for (const w of json.interference) map[w.affectedTaskId] = w;
          setInterference(map);
        }
      } catch {
        /* interference is advisory; ignore failures */
      }
    }, 400);
  }

  // Review-mode edit handlers: reuse commitSubtasks, then schedule interference.
  function reviewUpdate(id: string, patch: { title?: string; description?: string }) {
    commitSubtasks(updateSubtask(subtasks, id, patch));
    scheduleInterference(id);
  }
  function reviewSetLabels(id: string, labels: string[]) {
    commitSubtasks(setLabels(subtasks, id, labels));
    scheduleInterference(id);
  }
  function reviewAddLink(blockerId: string, blockedId: string) {
    commitSubtasks(addLink(subtasks, blockerId, blockedId));
    scheduleInterference(blockerId);
  }
  function reviewRemoveLink(blockerId: string, blockedId: string) {
    commitSubtasks(removeLink(subtasks, blockerId, blockedId));
    scheduleInterference(blockerId);
  }
  function reviewDelete(id: string) {
    const nextSubtasks = deleteSubtask(subtasks, id);
    commitSubtasks(nextSubtasks);
    setReviews((prev) => {
      const next = pruneReviews(prev, nextSubtasks.map((s) => s.id));
      persistReview(true, next);
      return next;
    });
    setInterference((prev) => { const n = { ...prev }; delete n[id]; return n; });
    if (selectedReviewId === id) setSelectedReviewId(nextSubtasks[0]?.id ?? null);
  }
```
Pass `onBake={bake}` to the `SubtaskList` (in the subtasks aside).
Clear review state in `confirmReKnead` (after clearing subtasks):
```ts
    setReviewing(false);
    setReviews({});
    setInterference({});
    persistReview(false, {});
```
Now render reviewer mode. The epic right-pane block currently is `subtasks.length > 0 ? <SubtaskList aside> : <KneadingPanel>`. Wrap it so that when `reviewing` is true, the WHOLE epic area renders `ReviewerMode` in the left column instead. The simplest faithful integration: in the left content area (where Editor renders for idle/running), add a top-level branch: if `epicMode && reviewing`, render `ReviewerMode` (full width of the left column) and SKIP the Editor + the right-pane epic block.

Concretely, find the idle/running left-column render (`mode.kind === "idle" || mode.kind === "running"`). At the top of that branch add:
```tsx
            {epicMode && reviewing ? (
              <ReviewerMode
                epicTitle={liveDraft?.title ?? ""}
                epicDescriptionHtml={liveDraft?.description ?? ""}
                subtasks={subtasks}
                reviews={reviews}
                interference={interference}
                selectedId={selectedReviewId}
                onSelect={setSelectedReviewId}
                onEditTasks={exitReview}
                onUpdate={reviewUpdate}
                onSetLabels={reviewSetLabels}
                onAddLink={reviewAddLink}
                onRemoveLink={reviewRemoveLink}
                onReviewChange={changeReview}
                onDelete={reviewDelete}
              />
            ) : (
              /* existing Editor + error banner JSX */
            )}
```
And guard the right-pane epic block so it does NOT render while reviewing:
```tsx
      {epicMode && !reviewing && (mode.kind === "idle" || mode.kind === "running") && knead.status !== "idle" && (
        /* existing subtasks-aside / KneadingPanel conditional */
      )}
```
Integrate faithfully with the actual JSX you find; keep all existing single-mode and non-review epic behavior intact.

- [ ] **Step 5: Run** — `npm test -- tests/components/StandaloneApp.epic.test.tsx tests/components/epic/SubtaskList.test.tsx tests/components/Editor.test.tsx && npm run typecheck && npm run lint`. All pass.

- [ ] **Step 6: Full suite** — `npm test`. No regressions.

- [ ] **Step 7: Commit**
```bash
git add components/Editor.tsx components/StandaloneApp.tsx tests/components/StandaloneApp.epic.test.tsx
git commit -m "feat(AI-36): wire Bake + reviewer mode + interference into StandaloneApp"
```

---

## Final verification
- [ ] `npm test && npm run typecheck && npm run lint` — all green.
- [ ] Manual (`npm run dev`): epic → knead → generate → Bake → reviewer mode; select tasks; Approve/Deny; Change-requested requires a comment; set assignee; edit a task → an interference warning appears on another task; nav recolors; reload persists reviewing+reviews; "Edit tasks" returns to the list; editing the epic description (lost-dough) clears review state.

## Spec coverage map
| Spec requirement | Task |
|---|---|
| Bake → reviewer mode transition | 11, 12 |
| Reviewer layout (nav | markdown/preview | diagrams) | 8, 10 |
| Per-task status + colored nav | 2, 6, 7 |
| Change-requested requires comment | 6 |
| Per-task assignee (free-text) | 6 |
| Tasks editable in reviewer mode | 9, 12 |
| Interference analysis on edit (warn, never auto-edit) | 3, 4, 5, 9, 12 |
| Persistence of reviewing/reviews; lost-dough clears | 1, 12 |
| Disabled Finalize (SP4 seam) + Diagrams placeholder | 10 |
| Deterministic stubs | 4, 5, 12 |
