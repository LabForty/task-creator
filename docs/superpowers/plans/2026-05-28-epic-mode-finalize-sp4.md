# Epic Mode — SP4: Finalize gate + Task graph + Batch Jira upload — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the disabled Finalize button + "Diagram from tasks arrives in a later phase." placeholder in reviewer mode with a working gate, a live task graph, and a batch upload sheet that drives the existing finalize + Jira export pipeline once per non-Denied task.

**Architecture:** Pure helpers first (`nonDeniedTaskIds`, mermaid builder, orchestrator). One presentational component per concern (`TaskGraph`, `UploadSheet` phases). Reuse the existing `allReviewed` helper for the gate; the existing `/api/finalize` + `/api/jira/export` endpoints for the per-task pipeline; the existing `MermaidDiagram` for rendering. All orchestration lives on the client.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript 5.6 · Vitest 4.1 (jsdom 25) · Tailwind 3.4 with HIG tokens · existing Anthropic Claude Agent SDK + SSE job stream · existing Jira export route.

**Test runner:** `pnpm test <pattern>` (alias for `vitest run --passWithNoTests`). If `pnpm` is not on PATH, use `npx vitest run <pattern>`. Typecheck: `npx tsc --noEmit`. Lint: `npx eslint . --ext .ts,.tsx`.

**Per-task hygiene:** every commit uses targeted `git add` for only the files this task touches. NEVER stage `prompts/types/*` — those are an unrelated template-sync side effect. Every commit message ends with the trailer `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

**Branch policy:** branch is `AI-36-epic-mode-sp1-kneading`; no pushes to origin during this plan (the user will smoke-test locally first).

---

## File Map

**Created:**
- `lib/upload/types.ts` — `RowState`, `RowsState`, `UploadTask`, `UploadDestination` types.
- `lib/upload/orchestrator.ts` — `runBatchUpload` pure async sequencer with row-state callbacks.
- `lib/epic/taskGraph.ts` — `buildTaskGraphMermaid` pure mermaid builder.
- `components/epic/review/TaskGraph.tsx` — small presentational wrapper around `MermaidDiagram`.
- `components/epic/review/UploadSheet.tsx` — three-phase slide-in sheet (destination → running → results).
- `tests/lib/taskGraph.test.ts`
- `tests/lib/upload-orchestrator.test.ts`
- `tests/components/epic/review/TaskGraph.test.tsx`
- `tests/components/epic/review/UploadSheet.test.tsx`

**Modified:**
- `lib/review/state.ts` — add `nonDeniedTaskIds` helper. The existing `allReviewed(ids, map)` already implements the Finalize gate semantics and is reused.
- `tests/lib/review-state.test.ts` — extend with the new helper.
- `lib/epic/tasks.ts` — extend `EpicTask` with optional `uploadedIssueKey?: string` and `uploadedIssueUrl?: string`. All reducer helpers already use immutable copies — the new fields ride through unchanged. No callsite changes required.
- `components/epic/review/ReviewerMode.tsx` — drop the diagram placeholder, mount `TaskGraph`. Compute Finalize's `disabled` via `allReviewed(...)`. Add an `onFinalize` prop the parent wires.
- `components/epic/review/ReviewNav.tsx` — render `AI-NNN` chip when a task descriptor has `uploadedIssueKey`.
- `tests/components/epic/review/ReviewerMode.test.tsx` — extend assertions for Finalize gating + TaskGraph mount.
- `tests/components/epic/review/ReviewNav.test.tsx` (if missing, create alongside the test for the chip).
- `components/StandaloneApp.tsx` — `uploadOpen` state, `onFinalize` handler, mount `UploadSheet`, persist `uploadedIssueKey`/`uploadedIssueUrl` on each task descriptor via the existing `persistEpicTasks` path; pass assignees into the sheet.

---

## Task 1: `nonDeniedTaskIds` helper

**Files:**
- Modify: `lib/review/state.ts`
- Modify: `tests/lib/review-state.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/lib/review-state.test.ts`:

```ts
import { nonDeniedTaskIds } from "@/lib/review/state";

describe("nonDeniedTaskIds", () => {
  it("returns only ids whose review status is not 'denied'", () => {
    const m = {
      a: { status: "approved", comment: "", assignee: null } as const,
      b: { status: "denied", comment: "", assignee: null } as const,
      c: { status: "pending", comment: "", assignee: null } as const,
    };
    expect(nonDeniedTaskIds(m, ["a", "b", "c"])).toEqual(["a", "c"]);
  });

  it("treats missing ids as not-denied (pass through)", () => {
    expect(nonDeniedTaskIds({}, ["x", "y"])).toEqual(["x", "y"]);
  });

  it("preserves input order", () => {
    const m = {
      a: { status: "denied", comment: "", assignee: null } as const,
      b: { status: "approved", comment: "", assignee: null } as const,
    };
    expect(nonDeniedTaskIds(m, ["b", "a", "c"])).toEqual(["b", "c"]);
  });
});
```

Also add `nonDeniedTaskIds` to the existing import line at the top of the file.

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/lib/review-state.test.ts
```

Expected: FAIL — module has no `nonDeniedTaskIds` export.

- [ ] **Step 3: Add the helper**

In `lib/review/state.ts`, append at the bottom:

```ts
// Filter task ids by removing those whose review is marked "denied".
// Missing entries (no review at all) are treated as not-denied so the
// list stays in input order; the gate check (allReviewed) is what
// actually requires every task to be approved or denied.
export function nonDeniedTaskIds(map: ReviewMap, ids: string[]): string[] {
  return ids.filter((id) => map[id]?.status !== "denied");
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/lib/review-state.test.ts
```

Expected: PASS (existing tests + 3 new).

- [ ] **Step 5: Commit**

```bash
git add lib/review/state.ts tests/lib/review-state.test.ts
git commit -m "feat(AI-36): nonDeniedTaskIds helper for batch upload filtering

Pre-orchestrator filter: drops 'denied' task ids while preserving input
order. The existing allReviewed helper already covers the 'every task
approved or denied' gate semantics SP4 needs, so we don't duplicate it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Extend `EpicTask` with upload result fields

**Files:**
- Modify: `lib/epic/tasks.ts`
- Modify: `tests/lib/epic-tasks.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/lib/epic-tasks.test.ts`:

```ts
describe("EpicTask uploadedIssueKey persistence", () => {
  it("setTitle preserves uploadedIssueKey + uploadedIssueUrl", () => {
    const list = [
      { id: "a", title: "T", labels: [], blocks: [], blockedBy: [], uploadedIssueKey: "AI-100", uploadedIssueUrl: "https://example/AI-100" },
    ];
    const next = setTitle(list, "a", "T2");
    expect(next[0].uploadedIssueKey).toBe("AI-100");
    expect(next[0].uploadedIssueUrl).toBe("https://example/AI-100");
    expect(next[0].title).toBe("T2");
  });

  it("addLink preserves uploadedIssueKey on both endpoints", () => {
    const list = [
      { id: "a", title: "A", labels: [], blocks: [], blockedBy: [], uploadedIssueKey: "AI-1" },
      { id: "b", title: "B", labels: [], blocks: [], blockedBy: [], uploadedIssueKey: "AI-2" },
    ];
    const next = addLink(list, "a", "b");
    expect(next.find((t) => t.id === "a")?.uploadedIssueKey).toBe("AI-1");
    expect(next.find((t) => t.id === "b")?.uploadedIssueKey).toBe("AI-2");
  });
});
```

`setTitle` and `addLink` are already imported at the top of the file. If not, add them.

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/lib/epic-tasks.test.ts
```

Expected: FAIL — the literal objects include `uploadedIssueKey`/`uploadedIssueUrl` properties not declared on `EpicTask` → TypeScript compile error in the test file.

- [ ] **Step 3: Extend the type**

In `lib/epic/tasks.ts`, change the `EpicTask` type to:

```ts
export type EpicTask = {
  id: string;
  title: string;
  labels: string[];
  blocks: string[];
  blockedBy: string[];
  // SP4: created Jira issue key + URL after a successful batch upload.
  // Persisted alongside the descriptor in the standalone draft.
  uploadedIssueKey?: string;
  uploadedIssueUrl?: string;
};
```

All reducer helpers already use spread / array-map immutable copies — the new optional fields are preserved without any code changes. Verify by re-reading `setTitle`, `setLabels`, `addLink`, `removeLink`, `deleteEpicTask` after the edit.

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/lib/epic-tasks.test.ts
```

Expected: PASS (existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add lib/epic/tasks.ts tests/lib/epic-tasks.test.ts
git commit -m "feat(AI-36): EpicTask carries uploadedIssueKey + uploadedIssueUrl

Optional fields populated after a successful Jira batch upload. The
descriptor reducer helpers already use immutable copies, so the new
fields ride through setTitle/setLabels/addLink/removeLink/deleteTask
unchanged. Persists alongside the rest of the descriptor via the
existing saveDraft(NAMESPACE, …) path.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `buildTaskGraphMermaid` pure builder

**Files:**
- Create: `lib/epic/taskGraph.ts`
- Create: `tests/lib/taskGraph.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/taskGraph.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildTaskGraphMermaid } from "@/lib/epic/taskGraph";
import type { EpicTask } from "@/lib/epic/tasks";
import type { ReviewMap } from "@/lib/review/types";

const blank: ReviewMap = {};

describe("buildTaskGraphMermaid", () => {
  it("returns empty string for empty input", () => {
    expect(buildTaskGraphMermaid({ tasks: [], reviews: blank })).toBe("");
  });

  it("emits one node per task with classDef declarations", () => {
    const tasks: EpicTask[] = [
      { id: "a", title: "Alpha", labels: [], blocks: [], blockedBy: [] },
    ];
    const out = buildTaskGraphMermaid({ tasks, reviews: blank });
    expect(out.startsWith("graph TD")).toBe(true);
    expect(out).toMatch(/classDef\s+approved/);
    expect(out).toMatch(/classDef\s+denied/);
    expect(out).toMatch(/classDef\s+change_requested/);
    expect(out).toMatch(/classDef\s+pending/);
    expect(out).toMatch(/t_a\["Alpha"\]:::pending/);
  });

  it("colors nodes by review status", () => {
    const tasks: EpicTask[] = [
      { id: "a", title: "A", labels: [], blocks: [], blockedBy: [] },
      { id: "b", title: "B", labels: [], blocks: [], blockedBy: [] },
      { id: "c", title: "C", labels: [], blocks: [], blockedBy: [] },
      { id: "d", title: "D", labels: [], blocks: [], blockedBy: [] },
    ];
    const reviews: ReviewMap = {
      a: { status: "approved", comment: "", assignee: null },
      b: { status: "denied", comment: "", assignee: null },
      c: { status: "change_requested", comment: "fix x", assignee: null },
      d: { status: "pending", comment: "", assignee: null },
    };
    const out = buildTaskGraphMermaid({ tasks, reviews });
    expect(out).toMatch(/t_a\[.*\]:::approved/);
    expect(out).toMatch(/t_b\[.*\]:::denied/);
    expect(out).toMatch(/t_c\[.*\]:::change_requested/);
    expect(out).toMatch(/t_d\[.*\]:::pending/);
  });

  it("emits a directed edge for each blocks link", () => {
    const tasks: EpicTask[] = [
      { id: "a", title: "A", labels: [], blocks: ["b"], blockedBy: [] },
      { id: "b", title: "B", labels: [], blocks: [], blockedBy: ["a"] },
    ];
    const out = buildTaskGraphMermaid({ tasks, reviews: blank });
    expect(out).toMatch(/t_a\s*-->\s*t_b/);
  });

  it("includes assignee on a second line when provided", () => {
    const tasks: EpicTask[] = [
      { id: "a", title: "Ship it", labels: [], blocks: [], blockedBy: [] },
    ];
    const out = buildTaskGraphMermaid({ tasks, reviews: blank, assignees: { a: "Alice" } });
    expect(out).toMatch(/t_a\["Ship it<br\/>\(Alice\)"\]/);
  });

  it("escapes HTML-significant chars in titles", () => {
    const tasks: EpicTask[] = [
      { id: "a", title: 'Has "quotes" & <brackets>', labels: [], blocks: [], blockedBy: [] },
    ];
    const out = buildTaskGraphMermaid({ tasks, reviews: blank });
    // Quote → #quot; entity; & → #amp;; < / > → #lt; #gt;
    expect(out).toMatch(/t_a\["Has #quot;quotes#quot; #amp; #lt;brackets#gt;"\]/);
  });

  it("truncates long titles to 40 chars with ellipsis", () => {
    const tasks: EpicTask[] = [
      { id: "a", title: "x".repeat(60), labels: [], blocks: [], blockedBy: [] },
    ];
    const out = buildTaskGraphMermaid({ tasks, reviews: blank });
    expect(out).toMatch(/t_a\["x{39}…"\]/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/lib/taskGraph.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the builder**

Create `lib/epic/taskGraph.ts`:

```ts
import type { EpicTask } from "./tasks";
import type { ReviewMap } from "@/lib/review/types";

export type TaskGraphInput = {
  tasks: EpicTask[];
  reviews: ReviewMap;
  assignees?: Record<string, string | undefined>;
};

const MAX_TITLE = 40;

// Mermaid uses HTML-ish entity references inside node labels. We can't emit
// real `&` because mermaid's parser interprets unescaped `&` poorly inside
// brackets, and we can't emit `<` or `>` either. The convention this codebase
// follows (see lib/jira/diagrams) is to substitute `#` for the entity prefix.
function escapeMermaid(text: string): string {
  return text
    .replace(/&/g, "#amp;")
    .replace(/"/g, "#quot;")
    .replace(/</g, "#lt;")
    .replace(/>/g, "#gt;");
}

function truncate(text: string): string {
  return text.length > MAX_TITLE ? text.slice(0, MAX_TITLE - 1) + "…" : text;
}

function statusClass(reviews: ReviewMap, id: string): string {
  const s = reviews[id]?.status;
  if (s === "approved" || s === "denied" || s === "change_requested") return s;
  return "pending";
}

export function buildTaskGraphMermaid(input: TaskGraphInput): string {
  if (input.tasks.length === 0) return "";

  const lines: string[] = ["graph TD"];

  // Class definitions — same palette used elsewhere for the four review states.
  lines.push("  classDef approved fill:#dcfce7,stroke:#16a34a,color:#065f46;");
  lines.push("  classDef denied fill:#fee2e2,stroke:#dc2626,color:#7f1d1d;");
  lines.push("  classDef change_requested fill:#fef9c3,stroke:#ca8a04,color:#713f12;");
  lines.push("  classDef pending fill:#f1f5f9,stroke:#64748b,color:#0f172a;");

  for (const t of input.tasks) {
    const title = escapeMermaid(truncate(t.title || "(untitled)"));
    const assignee = input.assignees?.[t.id];
    const label = assignee ? `${title}<br/>(${escapeMermaid(assignee)})` : title;
    lines.push(`  t_${t.id}["${label}"]:::${statusClass(input.reviews, t.id)}`);
  }

  // Edges from blocks. blockedBy is just the inverse, so we only emit from blocks.
  for (const t of input.tasks) {
    for (const blockedId of t.blocks) {
      lines.push(`  t_${t.id} --> t_${blockedId}`);
    }
  }

  return lines.join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/lib/taskGraph.test.ts
```

Expected: PASS (7/7).

- [ ] **Step 5: Commit**

```bash
git add lib/epic/taskGraph.ts tests/lib/taskGraph.test.ts
git commit -m "feat(AI-36): pure mermaid builder for reviewer task graph

buildTaskGraphMermaid produces a graph TD with one node per task,
color class via classDef based on review status, and directed edges
from each task's blocks list. Escapes HTML-significant chars using
the codebase's #entity convention; truncates titles to 40 chars.
Pure module — no react/mermaid/SDK imports.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `TaskGraph` component

**Files:**
- Create: `components/epic/review/TaskGraph.tsx`
- Create: `tests/components/epic/review/TaskGraph.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/epic/review/TaskGraph.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TaskGraph } from "@/components/epic/review/TaskGraph";
import type { EpicTask } from "@/lib/epic/tasks";

// MermaidDiagram lazy-loads the mermaid package; in jsdom we stub it.
vi.mock("@/components/MermaidDiagram", () => ({
  MermaidDiagram: ({ source }: { source: string }) => (
    <pre data-testid="mermaid-source">{source}</pre>
  ),
}));

describe("<TaskGraph>", () => {
  it("renders nothing when there are no tasks", () => {
    const { container } = render(<TaskGraph tasks={[]} reviews={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the mermaid source produced by the builder when tasks exist", () => {
    const tasks: EpicTask[] = [
      { id: "a", title: "Alpha", labels: [], blocks: [], blockedBy: [] },
    ];
    render(<TaskGraph tasks={tasks} reviews={{}} />);
    const src = screen.getByTestId("mermaid-source").textContent ?? "";
    expect(src).toContain("graph TD");
    expect(src).toContain("t_a[\"Alpha\"]");
  });

  it("forwards assignees into the builder so node labels include them", () => {
    const tasks: EpicTask[] = [
      { id: "a", title: "Ship", labels: [], blocks: [], blockedBy: [] },
    ];
    render(<TaskGraph tasks={tasks} reviews={{}} assignees={{ a: "Alice" }} />);
    const src = screen.getByTestId("mermaid-source").textContent ?? "";
    expect(src).toContain("Ship<br/>(Alice)");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/components/epic/review/TaskGraph.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/epic/review/TaskGraph'`.

- [ ] **Step 3: Implement the component**

Create `components/epic/review/TaskGraph.tsx`:

```tsx
"use client";

import { MermaidDiagram } from "@/components/MermaidDiagram";
import { buildTaskGraphMermaid } from "@/lib/epic/taskGraph";
import type { EpicTask } from "@/lib/epic/tasks";
import type { ReviewMap } from "@/lib/review/types";

type Props = {
  tasks: EpicTask[];
  reviews: ReviewMap;
  assignees?: Record<string, string | undefined>;
};

export function TaskGraph({ tasks, reviews, assignees }: Props) {
  if (tasks.length === 0) return null;
  const source = buildTaskGraphMermaid({ tasks, reviews, assignees });
  if (!source) return null;
  return (
    <div className="rounded-md border border-rule bg-surface p-2">
      <MermaidDiagram source={source} />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/components/epic/review/TaskGraph.test.tsx
```

Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add components/epic/review/TaskGraph.tsx tests/components/epic/review/TaskGraph.test.tsx
git commit -m "feat(AI-36): TaskGraph presentational component

Calls buildTaskGraphMermaid + pipes the source into MermaidDiagram.
Returns null when tasks is empty (or the builder returns an empty
source). No internal state — re-renders whenever the inputs change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Upload orchestrator types

**Files:**
- Create: `lib/upload/types.ts`

- [ ] **Step 1: Add the types**

Create `lib/upload/types.ts`:

```ts
import type { Draft } from "@/lib/draft/autosave";

// Per-row UI state inside the upload sheet. The orchestrator emits these via
// onRow callbacks so the sheet can show progress without owning the loop.
export type RowState =
  | { kind: "pending" }
  | { kind: "finalizing" }
  | { kind: "uploading" }
  | { kind: "uploaded"; issueKey: string; issueUrl: string }
  | { kind: "failed"; reason: string };

export type RowsState = Record<string, RowState>;

export type UploadTask = {
  id: string;
  draft: Draft;
  assignee?: string;
  labels: string[];
};

export type UploadDestination = {
  cloudId: string;
  projectKey: string;
  issueTypeId: string;
  parentEpicKey?: string;
};

export type BatchResult = {
  uploaded: string[];       // task ids that successfully finalized + uploaded
  failedId?: string;
  failedReason?: string;
};
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: TYPECHECK_OK (no consumer yet — file just exports types).

- [ ] **Step 3: Commit**

```bash
git add lib/upload/types.ts
git commit -m "feat(AI-36): upload orchestrator types

RowState (per-task UI state), UploadTask (the draft + assignee + labels
the orchestrator needs per row), UploadDestination (site/project/issueType
+ optional parent epic key), BatchResult (the orchestrator's return shape).
Pure types — no runtime.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `runBatchUpload` orchestrator

**Files:**
- Create: `lib/upload/orchestrator.ts`
- Create: `tests/lib/upload-orchestrator.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/upload-orchestrator.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runBatchUpload } from "@/lib/upload/orchestrator";
import type { UploadTask, UploadDestination, RowState } from "@/lib/upload/types";
import { EMPTY_DRAFT } from "@/lib/draft/autosave";

const dest: UploadDestination = { cloudId: "cid", projectKey: "AI", issueTypeId: "10001" };

function task(id: string): UploadTask {
  return { id, draft: { ...EMPTY_DRAFT, title: `T-${id}`, description: `desc ${id}` }, labels: [] };
}

// Helper: stub subscribeToJob from @/lib/sse/client so the orchestrator's
// SSE call resolves synchronously with the desired payload.
type FinalizedPayloadShape = { story: unknown; markdown: string; requirement?: unknown };
let nextFinalize: { kind: "ok"; payload: FinalizedPayloadShape } | { kind: "fail"; message: string } | null = null;

vi.mock("@/lib/sse/client", () => ({
  subscribeToJob: (_jobId: string, onEvent: (e: { type: string; [k: string]: unknown }) => void) => {
    const r = nextFinalize;
    queueMicrotask(() => {
      if (!r) return;
      if (r.kind === "ok") onEvent({ type: "finalized", payload: r.payload });
      else onEvent({ type: "error", message: r.message });
    });
    return () => {};
  },
}));

beforeEach(() => {
  nextFinalize = { kind: "ok", payload: { story: { title: "S", markdown: "" }, markdown: "" } };
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("/api/finalize")) {
      return Promise.resolve({ ok: true, json: async () => ({ jobId: "job-1" }) }) as unknown as Promise<Response>;
    }
    if (typeof url === "string" && url.includes("/api/jira/export")) {
      return Promise.resolve({ ok: true, json: async () => ({ key: "AI-99", url: "https://x/AI-99" }) }) as unknown as Promise<Response>;
    }
    return Promise.reject(new Error(`unexpected url ${url}`));
  }) as unknown as typeof fetch;
});
afterEach(() => { vi.restoreAllMocks(); });

describe("runBatchUpload", () => {
  it("processes tasks in input order, sequentially, emitting finalizing -> uploading -> uploaded", async () => {
    const seen: Array<[string, RowState["kind"]]> = [];
    const result = await runBatchUpload({
      tasks: [task("a"), task("b")],
      destination: dest,
      onRow: (id, state) => seen.push([id, state.kind]),
    });
    expect(result.uploaded).toEqual(["a", "b"]);
    expect(result.failedId).toBeUndefined();
    expect(seen).toEqual([
      ["a", "finalizing"], ["a", "uploading"], ["a", "uploaded"],
      ["b", "finalizing"], ["b", "uploading"], ["b", "uploaded"],
    ]);
  });

  it("stops on the first error and marks that row as failed (no further rows touched)", async () => {
    let i = 0;
    (global.fetch as unknown as { mockImplementation: (fn: (url: string) => unknown) => void }).mockImplementation((url: string) => {
      if (url.includes("/api/finalize")) {
        return Promise.resolve({ ok: true, json: async () => ({ jobId: "job-1" }) });
      }
      if (url.includes("/api/jira/export")) {
        i += 1;
        if (i === 2) return Promise.resolve({ ok: false, json: async () => ({ error: "boom" }) });
        return Promise.resolve({ ok: true, json: async () => ({ key: `AI-${i}`, url: "u" }) });
      }
      return Promise.reject(new Error("unexpected"));
    });
    const seen: Array<[string, RowState["kind"], string?]> = [];
    const result = await runBatchUpload({
      tasks: [task("a"), task("b"), task("c")],
      destination: dest,
      onRow: (id, state) =>
        seen.push([id, state.kind, state.kind === "failed" ? state.reason : state.kind === "uploaded" ? state.issueKey : undefined]),
    });
    expect(result.uploaded).toEqual(["a"]);
    expect(result.failedId).toBe("b");
    expect(result.failedReason).toMatch(/boom/);
    // "c" was never touched.
    expect(seen.map((s) => s[0])).toEqual(["a", "a", "a", "b", "b", "b"]);
    expect(seen[seen.length - 1][1]).toBe("failed");
  });

  it("aborts gracefully when signal is aborted between rows", async () => {
    const ac = new AbortController();
    const seen: Array<[string, RowState["kind"]]> = [];
    const promise = runBatchUpload({
      tasks: [task("a"), task("b")],
      destination: dest,
      signal: ac.signal,
      onRow: (id, state) => {
        seen.push([id, state.kind]);
        if (state.kind === "uploaded") ac.abort();
      },
    });
    const result = await promise;
    expect(result.uploaded).toEqual(["a"]);
    expect(result.failedId).toBe("b");
    expect(result.failedReason).toMatch(/cancelled/i);
  });

  it("treats an empty tasks list as a no-op (returns empty uploaded)", async () => {
    const result = await runBatchUpload({ tasks: [], destination: dest, onRow: () => {} });
    expect(result.uploaded).toEqual([]);
    expect(result.failedId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/lib/upload-orchestrator.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the orchestrator**

Create `lib/upload/orchestrator.ts`:

```ts
import { subscribeToJob } from "@/lib/sse/client";
import type { JobEvent, FinalizedPayload } from "@/lib/jobs/types";
import type { BatchResult, RowState, UploadDestination, UploadTask } from "./types";

type Args = {
  tasks: UploadTask[];
  destination: UploadDestination;
  signal?: AbortSignal;
  onRow: (id: string, state: RowState) => void;
};

async function finalizeOne(task: UploadTask, signal?: AbortSignal): Promise<FinalizedPayload> {
  const res = await fetch("/api/finalize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ draft: task.draft }),
    signal,
  });
  const json = (await res.json().catch(() => ({}))) as { jobId?: string; error?: string };
  if (!res.ok || !json.jobId) {
    throw new Error(json.error || `finalize failed (${res.status})`);
  }
  // Bridge the SSE stream into a promise that resolves on `finalized` or
  // rejects on `gates_failed` / `error`. The orchestrator only needs the
  // final payload; intermediate role_* / gate_* events are ignored.
  return new Promise<FinalizedPayload>((resolve, reject) => {
    const unsub = subscribeToJob(json.jobId!, (e: JobEvent) => {
      if (e.type === "finalized") {
        unsub();
        resolve(e.payload);
      } else if (e.type === "gates_failed") {
        unsub();
        reject(new Error("schema gates failed for this task"));
      } else if (e.type === "error") {
        unsub();
        reject(new Error(e.message));
      }
    });
  });
}

async function exportOne(
  payload: FinalizedPayload,
  task: UploadTask,
  dest: UploadDestination,
  signal?: AbortSignal,
): Promise<{ key: string; url: string }> {
  const res = await fetch("/api/jira/export", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    signal,
    body: JSON.stringify({
      cloudId: dest.cloudId,
      projectKey: dest.projectKey,
      issueTypeId: dest.issueTypeId,
      payload: { story: payload.story, markdown: payload.markdown, constraints: undefined },
      metadata: {
        labels: task.labels.length ? task.labels : undefined,
        epic: dest.parentEpicKey ? { key: dest.parentEpicKey } : undefined,
      },
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { key?: string; url?: string; error?: string };
  if (!res.ok || !json.key || !json.url) {
    throw new Error(json.error || `Jira export failed (${res.status})`);
  }
  return { key: json.key, url: json.url };
}

export async function runBatchUpload(args: Args): Promise<BatchResult> {
  const uploaded: string[] = [];
  for (const task of args.tasks) {
    if (args.signal?.aborted) {
      args.onRow(task.id, { kind: "failed", reason: "cancelled" });
      return { uploaded, failedId: task.id, failedReason: "cancelled" };
    }
    try {
      args.onRow(task.id, { kind: "finalizing" });
      const payload = await finalizeOne(task, args.signal);

      if (args.signal?.aborted) {
        args.onRow(task.id, { kind: "failed", reason: "cancelled" });
        return { uploaded, failedId: task.id, failedReason: "cancelled" };
      }

      args.onRow(task.id, { kind: "uploading" });
      const { key, url } = await exportOne(payload, task, args.destination, args.signal);
      args.onRow(task.id, { kind: "uploaded", issueKey: key, issueUrl: url });
      uploaded.push(task.id);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      args.onRow(task.id, { kind: "failed", reason });
      return { uploaded, failedId: task.id, failedReason: reason };
    }
  }
  return { uploaded };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/lib/upload-orchestrator.test.ts
```

Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add lib/upload/orchestrator.ts tests/lib/upload-orchestrator.test.ts
git commit -m "feat(AI-36): runBatchUpload sequencer for per-task finalize + Jira export

Processes UploadTask[] sequentially. For each task: POST /api/finalize,
await the finalized SSE event, then POST /api/jira/export. Emits row
states via onRow (pending -> finalizing -> uploading -> uploaded |
failed). Stops on the first error with no rollback. Aborts gracefully
between rows when signal fires.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `UploadSheet` destination phase

**Files:**
- Create: `components/epic/review/UploadSheet.tsx`
- Create: `tests/components/epic/review/UploadSheet.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/epic/review/UploadSheet.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UploadSheet } from "@/components/epic/review/UploadSheet";
import type { UploadTask } from "@/lib/upload/types";
import { EMPTY_DRAFT } from "@/lib/draft/autosave";

const tasks: UploadTask[] = [
  { id: "a", draft: { ...EMPTY_DRAFT, title: "Alpha" }, labels: [] },
];
const denied: { id: string; title: string }[] = [];

beforeEach(() => {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("/api/jira/resources")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ resources: [{ id: "cid", name: "Acme", url: "https://acme" }] }),
      });
    }
    if (typeof url === "string" && url.includes("/api/jira/projects")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ projects: [{ id: "p1", key: "AI", name: "AI Dept", avatarUrl: null }] }),
      });
    }
    if (typeof url === "string" && url.includes("/api/jira/issue-types")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ issueTypes: [{ id: "10001", name: "Story", iconUrl: null, description: null }] }),
      });
    }
    return Promise.reject(new Error(`unexpected ${url}`));
  }) as unknown as typeof fetch;
});
afterEach(() => { vi.restoreAllMocks(); });

describe("<UploadSheet> destination phase", () => {
  it("renders the destination form and a disabled Start upload until pickers are filled", async () => {
    render(
      <UploadSheet
        tasks={tasks}
        denied={denied}
        onCancel={() => {}}
        onPersistUploaded={() => {}}
      />,
    );
    expect(await screen.findByRole("heading", { name: /upload to jira/i })).toBeInTheDocument();
    // After resources auto-load, the single site auto-selects; user picks project + type.
    const start = await screen.findByRole("button", { name: /^start upload$/i });
    expect(start).toBeDisabled();
  });

  it("Cancel button fires onCancel", async () => {
    const onCancel = vi.fn();
    render(
      <UploadSheet
        tasks={tasks}
        denied={denied}
        onCancel={onCancel}
        onPersistUploaded={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/components/epic/review/UploadSheet.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Scaffold the sheet — destination phase only**

Create `components/epic/review/UploadSheet.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { runBatchUpload } from "@/lib/upload/orchestrator";
import type { BatchResult, RowState, RowsState, UploadDestination, UploadTask } from "@/lib/upload/types";

type Site = { id: string; name: string; url: string };
type Project = { id: string; key: string; name: string; avatarUrl: string | null };
type IssueType = { id: string; name: string; iconUrl: string | null; description: string | null };

type Phase = "destination" | "running" | "results";

export type UploadSheetProps = {
  tasks: UploadTask[];                                  // pre-filtered (non-Denied, not already uploaded)
  denied: { id: string; title: string }[];              // shown in the results "Excluded" list
  onCancel: () => void;
  onPersistUploaded: (id: string, issueKey: string, issueUrl: string) => void;
};

async function jsonGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin" });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : `Request failed (${res.status})`);
  return j as T;
}

export function UploadSheet({ tasks, denied, onCancel, onPersistUploaded }: UploadSheetProps) {
  const [phase, setPhase] = useState<Phase>("destination");
  const [sites, setSites] = useState<Site[] | null>(null);
  const [sitesErr, setSitesErr] = useState<string | null>(null);
  const [siteId, setSiteId] = useState<string>("");
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectsErr, setProjectsErr] = useState<string | null>(null);
  const [projectKey, setProjectKey] = useState<string>("");
  const [issueTypes, setIssueTypes] = useState<IssueType[] | null>(null);
  const [issueTypesErr, setIssueTypesErr] = useState<string | null>(null);
  const [issueTypeId, setIssueTypeId] = useState<string>("");
  const [parentEpicKey, setParentEpicKey] = useState<string>("");

  const [rows, setRows] = useState<RowsState>(() => Object.fromEntries(tasks.map((t) => [t.id, { kind: "pending" } as RowState])));
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load sites once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await jsonGet<{ resources: Site[] }>("/api/jira/resources");
        if (cancelled) return;
        setSites(d.resources);
        if (d.resources.length === 1) setSiteId(d.resources[0].id);
      } catch (e) {
        if (!cancelled) setSitesErr(e instanceof Error ? e.message : "failed to load Jira sites");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Projects on site change.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!siteId) { setProjects(null); return; }
      setProjectKey(""); setIssueTypes(null); setIssueTypeId("");
      try {
        const d = await jsonGet<{ projects: Project[] }>(`/api/jira/projects?cloudId=${encodeURIComponent(siteId)}`);
        if (cancelled) return;
        setProjects(d.projects);
      } catch (e) {
        if (!cancelled) setProjectsErr(e instanceof Error ? e.message : "failed to load projects");
      }
    })();
    return () => { cancelled = true; };
  }, [siteId]);

  // Issue types on project change.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!siteId || !projectKey) { setIssueTypes(null); return; }
      setIssueTypeId("");
      try {
        const d = await jsonGet<{ issueTypes: IssueType[] }>(
          `/api/jira/issue-types?cloudId=${encodeURIComponent(siteId)}&projectKey=${encodeURIComponent(projectKey)}`,
        );
        if (cancelled) return;
        setIssueTypes(d.issueTypes);
        const preferred = d.issueTypes.find((t) => /^(story|task)$/i.test(t.name));
        if (preferred) setIssueTypeId(preferred.id);
        else if (d.issueTypes[0]) setIssueTypeId(d.issueTypes[0].id);
      } catch (e) {
        if (!cancelled) setIssueTypesErr(e instanceof Error ? e.message : "failed to load issue types");
      }
    })();
    return () => { cancelled = true; };
  }, [siteId, projectKey]);

  const canStart = useMemo(
    () => Boolean(siteId && projectKey && issueTypeId) && tasks.length > 0,
    [siteId, projectKey, issueTypeId, tasks.length],
  );

  async function startUpload() {
    if (!canStart) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setPhase("running");
    const destination: UploadDestination = {
      cloudId: siteId,
      projectKey,
      issueTypeId,
      parentEpicKey: parentEpicKey.trim() || undefined,
    };
    const result = await runBatchUpload({
      tasks,
      destination,
      signal: ac.signal,
      onRow: (id, state) => {
        setRows((prev) => ({ ...prev, [id]: state }));
        if (state.kind === "uploaded") onPersistUploaded(id, state.issueKey, state.issueUrl);
      },
    });
    abortRef.current = null;
    setBatchResult(result);
    setPhase("results");
  }

  function cancelRun() {
    abortRef.current?.abort();
  }

  return (
    <aside className="fixed right-0 top-0 h-screen w-[480px] bg-surface border-l border-rule shadow-lg z-30 flex flex-col">
      <header className="px-6 py-4 border-b border-rule flex items-center gap-3 shrink-0">
        <h2 className="text-hig-title3">Upload to Jira</h2>
        <span className="flex-1" />
        {phase === "destination" && <Button variant="secondary" onClick={onCancel}>Cancel</Button>}
        {phase === "running" && <Button variant="secondary" onClick={cancelRun}>Cancel</Button>}
        {phase === "results" && <Button variant="secondary" onClick={onCancel}>Done</Button>}
      </header>

      {phase === "destination" && (
        <div className="px-6 py-6 flex-1 overflow-auto flex flex-col gap-4">
          <p className="text-hig-body text-ink-secondary">
            {tasks.length} task{tasks.length === 1 ? "" : "s"} will be uploaded.
            {denied.length > 0 && ` ${denied.length} denied task${denied.length === 1 ? "" : "s"} will be excluded.`}
          </p>

          {sitesErr && <p className="text-hig-footnote text-danger">{sitesErr}</p>}
          <label className="flex flex-col gap-1.5">
            <span className="text-hig-subhead font-medium text-ink">Jira site</span>
            <select
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              disabled={!sites}
              className="h-10 px-3 rounded-md bg-surface border border-rule text-hig-body"
            >
              <option value="">{sites ? "Pick a site" : "Loading sites…"}</option>
              {(sites ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>

          {projectsErr && <p className="text-hig-footnote text-danger">{projectsErr}</p>}
          <label className="flex flex-col gap-1.5">
            <span className="text-hig-subhead font-medium text-ink">Project</span>
            <select
              value={projectKey}
              onChange={(e) => setProjectKey(e.target.value)}
              disabled={!projects}
              className="h-10 px-3 rounded-md bg-surface border border-rule text-hig-body"
            >
              <option value="">{projects ? "Pick a project" : (siteId ? "Loading projects…" : "Pick a site first")}</option>
              {(projects ?? []).map((p) => <option key={p.key} value={p.key}>{p.name} ({p.key})</option>)}
            </select>
          </label>

          {issueTypesErr && <p className="text-hig-footnote text-danger">{issueTypesErr}</p>}
          <label className="flex flex-col gap-1.5">
            <span className="text-hig-subhead font-medium text-ink">Issue type</span>
            <select
              value={issueTypeId}
              onChange={(e) => setIssueTypeId(e.target.value)}
              disabled={!issueTypes}
              className="h-10 px-3 rounded-md bg-surface border border-rule text-hig-body"
            >
              <option value="">{issueTypes ? "Pick an issue type" : (projectKey ? "Loading issue types…" : "Pick a project first")}</option>
              {(issueTypes ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-hig-subhead font-medium text-ink">Parent epic key (optional)</span>
            <input
              type="text"
              value={parentEpicKey}
              onChange={(e) => setParentEpicKey(e.target.value)}
              placeholder="e.g. AI-36"
              className="h-10 px-3 rounded-md bg-surface border border-rule text-hig-body"
            />
          </label>

          <div className="mt-auto pt-4 border-t border-rule flex justify-end">
            <Button onClick={startUpload} disabled={!canStart}>Start upload</Button>
          </div>
        </div>
      )}

      {phase === "running" && (
        <UploadProgress rows={rows} tasks={tasks} />
      )}

      {phase === "results" && batchResult && (
        <UploadResults rows={rows} tasks={tasks} denied={denied} result={batchResult} onClose={onCancel} onRetry={() => setPhase("destination")} />
      )}
    </aside>
  );
}

function UploadProgress({ rows, tasks }: { rows: RowsState; tasks: UploadTask[] }) {
  return (
    <div className="px-6 py-6 flex-1 overflow-auto flex flex-col gap-2">
      <h3 className="hig-section-label">Uploading</h3>
      <ul className="flex flex-col gap-1.5">
        {tasks.map((t) => {
          const r = rows[t.id] ?? { kind: "pending" };
          return (
            <li key={t.id} className="flex items-center gap-2 text-hig-body">
              <span className="flex-1 truncate">{t.draft.title || "(untitled)"}</span>
              <span className="text-hig-footnote text-ink-secondary">{labelFor(r)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function UploadResults({
  rows, tasks, denied, result, onClose, onRetry,
}: {
  rows: RowsState;
  tasks: UploadTask[];
  denied: { id: string; title: string }[];
  result: BatchResult;
  onClose: () => void;
  onRetry: () => void;
}) {
  const uploaded = tasks.filter((t) => rows[t.id]?.kind === "uploaded").map((t) => ({
    id: t.id, title: t.draft.title || "(untitled)", row: rows[t.id] as Extract<RowState, { kind: "uploaded" }>,
  }));
  const failed = result.failedId ? tasks.find((t) => t.id === result.failedId) : undefined;

  return (
    <div className="px-6 py-6 flex-1 overflow-auto flex flex-col gap-4">
      <h3 className="hig-section-label">Results</h3>
      {uploaded.length > 0 && (
        <div>
          <h4 className="text-hig-subhead font-medium text-ink mb-1">Uploaded ({uploaded.length})</h4>
          <ul className="flex flex-col gap-1">
            {uploaded.map((u) => (
              <li key={u.id} className="text-hig-body">
                <a href={u.row.issueUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  {u.row.issueKey}
                </a>{" "}— {u.title}
              </li>
            ))}
          </ul>
        </div>
      )}
      {failed && (
        <div className="rounded-md bg-danger/5 border border-danger/30 px-3 py-2">
          <h4 className="text-hig-subhead font-medium text-danger mb-1">Failed</h4>
          <p className="text-hig-body">{failed.draft.title || "(untitled)"}</p>
          <p className="text-hig-footnote text-ink-secondary">{result.failedReason}</p>
          <div className="mt-2">
            <Button size="sm" variant="secondary" onClick={onRetry}>Retry from here</Button>
          </div>
        </div>
      )}
      {denied.length > 0 && (
        <div>
          <h4 className="text-hig-subhead font-medium text-ink mb-1">Excluded — denied ({denied.length})</h4>
          <ul className="flex flex-col gap-1">
            {denied.map((d) => (
              <li key={d.id} className="text-hig-body text-ink-secondary">{d.title || "(untitled)"}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-auto pt-4 border-t border-rule flex justify-end">
        <Button onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}

function labelFor(r: RowState): string {
  switch (r.kind) {
    case "pending": return "pending";
    case "finalizing": return "finalizing…";
    case "uploading": return "uploading…";
    case "uploaded": return r.issueKey;
    case "failed": return `failed: ${r.reason}`;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/components/epic/review/UploadSheet.test.tsx
```

Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add components/epic/review/UploadSheet.tsx tests/components/epic/review/UploadSheet.test.tsx
git commit -m "feat(AI-36): UploadSheet scaffold (destination phase)

Slide-in right sheet driven by phase state (destination | running |
results). Destination phase loads site -> projects -> issue types
from the existing /api/jira/* endpoints, exposes an optional parent
epic key field, and gates Start upload on all three pickers being
filled. Running + results phases stubbed for next two tasks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: `UploadSheet` running + results integration test

**Files:**
- Modify: `tests/components/epic/review/UploadSheet.test.tsx`

This task verifies the running + results phases end-to-end through the orchestrator. Task 7 already wired the JSX; this task adds coverage.

- [ ] **Step 1: Append the test**

Add this `describe` block at the bottom of `tests/components/epic/review/UploadSheet.test.tsx`:

```tsx
import { vi as vi2 } from "vitest";

// Bridge: mock subscribeToJob so the orchestrator's SSE call resolves.
vi2.mock("@/lib/sse/client", () => ({
  subscribeToJob: (_jobId: string, onEvent: (e: { type: string; [k: string]: unknown }) => void) => {
    queueMicrotask(() => onEvent({ type: "finalized", payload: { story: { title: "S", markdown: "" }, markdown: "" } }));
    return () => {};
  },
}));

describe("<UploadSheet> running + results phases", () => {
  beforeEach(() => {
    let exportCount = 0;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/api/jira/resources")) {
        return Promise.resolve({ ok: true, json: async () => ({ resources: [{ id: "cid", name: "Acme", url: "x" }] }) });
      }
      if (typeof url === "string" && url.includes("/api/jira/projects")) {
        return Promise.resolve({ ok: true, json: async () => ({ projects: [{ id: "p1", key: "AI", name: "AI", avatarUrl: null }] }) });
      }
      if (typeof url === "string" && url.includes("/api/jira/issue-types")) {
        return Promise.resolve({ ok: true, json: async () => ({ issueTypes: [{ id: "10001", name: "Story", iconUrl: null, description: null }] }) });
      }
      if (typeof url === "string" && url.includes("/api/finalize")) {
        return Promise.resolve({ ok: true, json: async () => ({ jobId: "job-1" }) });
      }
      if (typeof url === "string" && url.includes("/api/jira/export")) {
        exportCount += 1;
        return Promise.resolve({ ok: true, json: async () => ({ key: `AI-${exportCount}`, url: `https://x/AI-${exportCount}` }) });
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    }) as unknown as typeof fetch;
  });

  it("runs the orchestrator and shows uploaded keys in results", async () => {
    const onPersistUploaded = vi.fn();
    render(
      <UploadSheet
        tasks={[
          { id: "a", draft: { ...EMPTY_DRAFT, title: "Alpha" }, labels: [] },
          { id: "b", draft: { ...EMPTY_DRAFT, title: "Bravo" }, labels: [] },
        ]}
        denied={[]}
        onCancel={() => {}}
        onPersistUploaded={onPersistUploaded}
      />,
    );

    // Wait for site → auto-select; pick project + issue type.
    await screen.findByRole("option", { name: /AI Dept|AI \(AI\)|AI/i }); // project loaded
    const selects = screen.getAllByRole("combobox");
    // Pick AI in the project select (2nd select).
    await userEvent.selectOptions(selects[1], "AI");
    // Pick Story in the issue type select (3rd).
    await screen.findByRole("option", { name: /story/i });
    const selectsAfter = screen.getAllByRole("combobox");
    await userEvent.selectOptions(selectsAfter[2], "10001");

    await userEvent.click(screen.getByRole("button", { name: /^start upload$/i }));

    // Eventually lands in results phase with the two uploaded keys.
    expect(await screen.findByRole("heading", { name: /^results$/i })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /AI-1/ })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /AI-2/ })).toBeInTheDocument();
    expect(onPersistUploaded).toHaveBeenCalledTimes(2);
    expect(onPersistUploaded).toHaveBeenCalledWith("a", "AI-1", "https://x/AI-1");
    expect(onPersistUploaded).toHaveBeenCalledWith("b", "AI-2", "https://x/AI-2");
  });
});
```

- [ ] **Step 2: Run the test**

```bash
npx vitest run tests/components/epic/review/UploadSheet.test.tsx
```

Expected: PASS for the new test (and the two from Task 7 still pass). If a test is flaky, increase the `findBy` timeout via `{ timeout: 3000 }` rather than adding sleeps.

- [ ] **Step 3: Commit**

```bash
git add tests/components/epic/review/UploadSheet.test.tsx
git commit -m "test(AI-36): UploadSheet running -> results integration

Drives the sheet through destination -> Start upload -> orchestrator
runs (mocked SSE returns finalized; mocked fetch returns Jira keys) ->
results phase. Verifies uploaded keys render with links AND that
onPersistUploaded was called with each issue key + url.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Wire `TaskGraph` + Finalize gating into `ReviewerMode`

**Files:**
- Modify: `components/epic/review/ReviewerMode.tsx`
- Modify: `tests/components/epic/review/ReviewerMode.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `tests/components/epic/review/ReviewerMode.test.tsx`:

```tsx
// Stub MermaidDiagram so jsdom doesn't try to lazy-import mermaid.
vi.mock("@/components/MermaidDiagram", () => ({
  MermaidDiagram: ({ source }: { source: string }) => <pre data-testid="md-source">{source}</pre>,
}));

it("renders the TaskGraph when tasks exist and removes the placeholder", () => {
  render(
    <ReviewerMode
      epicTitle="E"
      epicDescriptionHtml=""
      tasks={[{ id: "a", title: "Alpha", labels: [], blocks: [], blockedBy: [] }]}
      reviews={{}}
      interference={{}}
      selectedId={null}
      refreshKey={0}
      onSelect={() => {}}
      onEditTasks={() => {}}
      onFinalize={() => {}}
      onTitleChange={() => {}}
      onSetLabels={() => {}}
      onAddLink={() => {}}
      onRemoveLink={() => {}}
      onReviewChange={() => {}}
      onDelete={() => {}}
    />,
  );
  expect(screen.queryByText(/diagram from tasks arrives in a later phase\./i)).toBeNull();
  expect(screen.getByTestId("md-source").textContent ?? "").toContain("t_a[\"Alpha\"]");
});

it("Finalize is disabled when not all tasks are approved/denied", () => {
  render(
    <ReviewerMode
      epicTitle="E"
      epicDescriptionHtml=""
      tasks={[{ id: "a", title: "Alpha", labels: [], blocks: [], blockedBy: [] }]}
      reviews={{ a: { status: "pending", comment: "", assignee: null } }}
      interference={{}}
      selectedId={null}
      refreshKey={0}
      onSelect={() => {}}
      onEditTasks={() => {}}
      onFinalize={() => {}}
      onTitleChange={() => {}}
      onSetLabels={() => {}}
      onAddLink={() => {}}
      onRemoveLink={() => {}}
      onReviewChange={() => {}}
      onDelete={() => {}}
    />,
  );
  expect(screen.getByRole("button", { name: /^finalize$/i })).toBeDisabled();
});

it("Finalize is enabled and fires onFinalize when every task is approved or denied", async () => {
  const onFinalize = vi.fn();
  render(
    <ReviewerMode
      epicTitle="E"
      epicDescriptionHtml=""
      tasks={[
        { id: "a", title: "Alpha", labels: [], blocks: [], blockedBy: [] },
        { id: "b", title: "Bravo", labels: [], blocks: [], blockedBy: [] },
      ]}
      reviews={{
        a: { status: "approved", comment: "", assignee: null },
        b: { status: "denied", comment: "", assignee: null },
      }}
      interference={{}}
      selectedId={null}
      refreshKey={0}
      onSelect={() => {}}
      onEditTasks={() => {}}
      onFinalize={onFinalize}
      onTitleChange={() => {}}
      onSetLabels={() => {}}
      onAddLink={() => {}}
      onRemoveLink={() => {}}
      onReviewChange={() => {}}
      onDelete={() => {}}
    />,
  );
  const btn = screen.getByRole("button", { name: /^finalize$/i });
  expect(btn).not.toBeDisabled();
  await userEvent.click(btn);
  expect(onFinalize).toHaveBeenCalledTimes(1);
});
```

`userEvent` is already imported in the file.

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/components/epic/review/ReviewerMode.test.tsx
```

Expected: FAIL — `onFinalize` prop unknown to ReviewerMode; the diagram placeholder is still there; Finalize button is hardcoded disabled.

- [ ] **Step 3: Update `ReviewerMode`**

In `components/epic/review/ReviewerMode.tsx`:

1. Add imports at the top:

```ts
import { TaskGraph } from "@/components/epic/review/TaskGraph";
import { allReviewed } from "@/lib/review/state";
```

2. Extend Props with `onFinalize: () => void` (between `onEditTasks` and `onTitleChange`):

```ts
type Props = {
  // …existing props…
  onEditTasks: () => void;
  onFinalize: () => void;
  // …rest…
};
```

3. Inside the component, after the `const selected = …` line, compute:

```ts
const finalizeReady = allReviewed(props.tasks.map((t) => t.id), props.reviews);
const assignees = Object.fromEntries(
  Object.entries(props.reviews)
    .filter(([, r]) => r.assignee)
    .map(([id, r]) => [id, r.assignee as string]),
);
```

4. Replace the existing `Diagrams` placeholder block (currently the `<div>` containing `<p>Diagram from tasks arrives in a later phase.</p>`) with:

```tsx
        <div>
          <h3 className="hig-section-label">Task graph</h3>
          <TaskGraph tasks={props.tasks} reviews={props.reviews} assignees={assignees} />
        </div>
```

5. Replace the existing Finalize button:

```tsx
          <Button
            type="button"
            disabled={!finalizeReady}
            title={finalizeReady ? undefined : "You need to review all the tasks and resolve requested changes"}
            onClick={props.onFinalize}
          >
            Finalize
          </Button>
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/components/epic/review/ReviewerMode.test.tsx
```

Expected: PASS for the three new tests AND the existing `← Back to tabs` test from Task 14 of the prior plan.

- [ ] **Step 5: Commit**

```bash
git add components/epic/review/ReviewerMode.tsx tests/components/epic/review/ReviewerMode.test.tsx
git commit -m "feat(AI-36): wire TaskGraph + Finalize gate into ReviewerMode

- Drop the 'Diagram from tasks arrives in a later phase.' placeholder
  and mount <TaskGraph tasks reviews assignees /> in the Task graph
  section. Assignees derived from reviews map.
- Compute finalizeReady = allReviewed(taskIds, reviews) and bind the
  Finalize button's disabled + onClick to it. Tooltip preserved when
  disabled.
- New required onFinalize prop the parent wires in the next task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: `ReviewNav` AI-NNN chip on uploaded tasks

**Files:**
- Modify: `components/epic/review/ReviewNav.tsx`
- Modify: `tests/components/epic/review/ReviewNav.test.tsx` (create if missing)

- [ ] **Step 1: Inspect the file**

Read `components/epic/review/ReviewNav.tsx`. Locate the JSX that renders each task row (title + status chip). The change is small: when `task.uploadedIssueKey` is truthy, render an extra chip with that key.

- [ ] **Step 2: Write the failing test**

If `tests/components/epic/review/ReviewNav.test.tsx` doesn't exist, create it with:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReviewNav } from "@/components/epic/review/ReviewNav";

describe("<ReviewNav>", () => {
  it("renders the uploadedIssueKey chip when set on the descriptor", () => {
    render(
      <ReviewNav
        tasks={[
          { id: "a", title: "Alpha", labels: [], blocks: [], blockedBy: [], uploadedIssueKey: "AI-42" },
          { id: "b", title: "Bravo", labels: [], blocks: [], blockedBy: [] },
        ]}
        reviews={{}}
        selectedId={null}
        onSelect={() => {}}
        interference={{}}
      />,
    );
    expect(screen.getByText("AI-42")).toBeInTheDocument();
  });

  it("does not render any chip when no task has uploadedIssueKey", () => {
    render(
      <ReviewNav
        tasks={[{ id: "a", title: "Alpha", labels: [], blocks: [], blockedBy: [] }]}
        reviews={{}}
        selectedId={null}
        onSelect={() => {}}
        interference={{}}
      />,
    );
    expect(screen.queryByText(/^AI-/)).toBeNull();
  });
});
```

If the file exists, append the two tests inside its describe block. If the existing test file uses a different `tasks` shape (because pre-SP4 `EpicTask` didn't have the new fields), the type extension from Task 2 makes those existing tests still pass — no edits needed there.

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run tests/components/epic/review/ReviewNav.test.tsx
```

Expected: FAIL — no "AI-42" text rendered.

- [ ] **Step 4: Add the chip**

Inside the per-task row JSX in `components/epic/review/ReviewNav.tsx`, locate where the title text is rendered. Adjacent to the title (after it, to its right inside the same flex container), insert:

```tsx
{task.uploadedIssueKey && (
  <span className="inline-flex items-center px-1.5 rounded-sm bg-success/10 text-success text-[10px] font-semibold uppercase tracking-wide">
    {task.uploadedIssueKey}
  </span>
)}
```

The exact JSX shape depends on the existing layout — keep the chip styling consistent with how `interference` warnings or status chips are already rendered in this file. The required outcome is: an element whose text content equals the key, present only when `task.uploadedIssueKey` is set.

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/components/epic/review/ReviewNav.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/epic/review/ReviewNav.tsx tests/components/epic/review/ReviewNav.test.tsx
git commit -m "feat(AI-36): show AI-NNN chip in ReviewNav for uploaded tasks

When task.uploadedIssueKey is set on the descriptor, render a small
success-tinted chip next to the task title with the Jira key. The
chip persists across reloads because the field is part of the
descriptor.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: StandaloneApp wiring — `onFinalize` + `UploadSheet` mount

**Files:**
- Modify: `components/StandaloneApp.tsx`
- Modify: `tests/components/StandaloneApp.test.tsx`

- [ ] **Step 1: Write the failing integration test**

Append to `tests/components/StandaloneApp.test.tsx`:

```tsx
// Mock MermaidDiagram + subscribeToJob so the reviewer renders cleanly in jsdom.
vi.mock("@/components/MermaidDiagram", () => ({
  MermaidDiagram: ({ source }: { source: string }) => <pre data-testid="md-source">{source}</pre>,
}));
vi.mock("@/lib/sse/client", () => ({
  subscribeToJob: () => () => {},
}));

it("clicking Finalize opens the UploadSheet when every task is reviewed", async () => {
  // Seed an epic-mode draft with two tasks, both reviewed, in reviewer mode.
  window.localStorage.setItem(
    "task-creator:draft:standalone",
    JSON.stringify({
      ...EMPTY_DRAFT,
      mode: "epic",
      title: "Epic",
      description: "<p>epic</p>",
      epicTasks: [
        { id: "a", title: "Alpha", labels: [], blocks: [], blockedBy: [] },
        { id: "b", title: "Bravo", labels: [], blocks: [], blockedBy: [] },
      ],
      reviewing: true,
      reviews: {
        a: { status: "approved", comment: "", assignee: null },
        b: { status: "denied", comment: "", assignee: null },
      },
    }),
  );
  // Seed per-task drafts so the orchestrator has descriptions to send.
  window.localStorage.setItem(
    "task-creator:draft:standalone:epic:a",
    JSON.stringify({ ...EMPTY_DRAFT, title: "Alpha", description: "do A" }),
  );

  // Stub the Jira resources endpoints minimally — the sheet must be reachable
  // without actually starting an upload.
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("/api/jira/resources")) {
      return Promise.resolve({ ok: true, json: async () => ({ resources: [] }) });
    }
    if (typeof url === "string" && url.includes("/api/jira/session")) {
      return Promise.resolve({ ok: true, json: async () => ({ configured: false, connected: false }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  }) as unknown as typeof fetch;

  render(<StandaloneApp initialSession={{ configured: false, connected: false }} />);
  const btn = await screen.findByRole("button", { name: /^finalize$/i });
  expect(btn).not.toBeDisabled();
  await userEvent.click(btn);

  expect(await screen.findByRole("heading", { name: /upload to jira/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/components/StandaloneApp.test.tsx -t "opens the UploadSheet"
```

Expected: FAIL — Finalize button is currently still hardcoded disabled by the parent OR `UploadSheet` isn't mounted.

(Task 9 already changed the disabled wiring inside ReviewerMode, but the parent has not yet wired the `onFinalize` prop — TypeScript will fail-compile until it does. If the test reports a TS error instead of a runtime failure, that still satisfies the red phase.)

- [ ] **Step 3: Wire the parent**

In `components/StandaloneApp.tsx`:

1. Add imports near the other epic imports:

```ts
import { UploadSheet } from "@/components/epic/review/UploadSheet";
import type { UploadTask } from "@/lib/upload/types";
import { nonDeniedTaskIds } from "@/lib/review/state";
```

2. Add a state slot near the other review-related state (close to `selectedReviewId`):

```ts
const [uploadOpen, setUploadOpen] = useState(false);
```

3. Add the handler near `bake` / `exitReview`:

```ts
function startFinalize() {
  setUploadOpen(true);
}

function persistUploadedKey(id: string, issueKey: string, issueUrl: string) {
  setEpicTasks((prev) => {
    const next = prev.map((t) => (t.id === id ? { ...t, uploadedIssueKey: issueKey, uploadedIssueUrl: issueUrl } : t));
    persistEpicTasks(next);
    return next;
  });
}
```

4. Build the upload-task list inline at the JSX site so it reflects the latest descriptor state:

In the ReviewerMode mount block (the `epicMode && reviewing ? <ReviewerMode … />` branch), pass the new prop:

```tsx
              onFinalize={startFinalize}
```

5. Mount the sheet at the bottom of the component (near the other floating panels like `HelpPanel` / `EditReviewSheet`):

```tsx
{uploadOpen && (() => {
  const denied = epicTasks
    .filter((t) => reviews[t.id]?.status === "denied")
    .map((t) => ({ id: t.id, title: t.title }));
  const ids = nonDeniedTaskIds(reviews, epicTasks.map((t) => t.id))
    .filter((id) => !epicTasks.find((t) => t.id === id)?.uploadedIssueKey);
  const uploadTasks: UploadTask[] = ids
    .map((id) => {
      const t = epicTasks.find((x) => x.id === id)!;
      const d = loadDraft(epicTaskNamespace(id));
      return { id, draft: d, assignee: reviews[id]?.assignee ?? undefined, labels: t.labels };
    });
  return (
    <UploadSheet
      tasks={uploadTasks}
      denied={denied}
      onCancel={() => setUploadOpen(false)}
      onPersistUploaded={persistUploadedKey}
    />
  );
})()}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/components/StandaloneApp.test.tsx
```

Expected: PASS. The full `tests/components` sweep should also stay green:

```bash
npx vitest run tests/components
```

- [ ] **Step 5: Commit**

```bash
git add components/StandaloneApp.tsx tests/components/StandaloneApp.test.tsx
git commit -m "feat(AI-36): StandaloneApp wires Finalize -> UploadSheet

- Adds uploadOpen state + startFinalize handler. Passes
  onFinalize=startFinalize to ReviewerMode so the Finalize button
  opens the sheet when gated open.
- Builds the per-render UploadTask[] from epicTasks filtered through
  nonDeniedTaskIds and a not-already-uploaded predicate. Each task
  carries the per-task draft loaded from its namespace plus the
  reviewer's assignee + descriptor labels.
- persistUploadedKey writes uploadedIssueKey/uploadedIssueUrl onto
  the descriptor via persistEpicTasks so a refresh keeps the AI-NNN
  chip in ReviewNav and the orchestrator skips already-done tasks
  on a subsequent run.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Final verification

**Files:** none

- [ ] **Step 1: Full test suite**

```bash
npx vitest run
```

Expected: all tests pass (the one pre-existing `.skip` from the prior plan stays skipped — nothing else).

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: TYPECHECK_OK.

- [ ] **Step 3: Lint**

```bash
npx eslint . --ext .ts,.tsx
```

Expected: no warnings or errors.

- [ ] **Step 4: Smoke the live app**

```bash
pnpm dev
```

In epic mode: knead a description, generate sub-tasks, switch to reviewer mode, give each task a status (mix of approved + denied). Confirm:

- The Task graph appears under the navigation with one node per task, edges from blocks, fill colored by status.
- The Finalize button enables only when every task is approved or denied.
- Clicking Finalize opens the slide-in sheet on the right with Jira site / project / issue type pickers + an optional parent epic key field.
- Cancel closes the sheet.
- After a successful run, each uploaded task gets an `AI-NNN` chip in the nav and the chip survives a page reload.
- A re-click on Finalize after a partial run only attempts not-yet-uploaded tasks.
- A denied task is never attempted and shows up in the Results "Excluded" list.

- [ ] **Step 5: No commit needed**

Verification step only. If any gate failed, surface the failure to the user before declaring done.

---

## Self-review checklist (filled by plan author)

- **Spec coverage:**
  - §1 Finalize gating → Task 9 (uses existing `allReviewed`). ✅
  - §2 Task graph (live mermaid, status-colored, edges, assignee labels) → Tasks 3 + 4 + 9. ✅
  - §3 Per-task pipeline → Task 6 (`runBatchUpload`). ✅
  - §4 Upload sheet (destination → running → results, retry-from-here, cancel) → Tasks 7 + 8 (running/results coverage). ✅
  - §5 Post-success summary → Task 7 (UploadResults inner component). ✅
  - §6 State tracking on completed uploads (`uploadedIssueKey` persistence + ReviewNav chip) → Tasks 2 + 10 + 11. ✅
  - Acceptance criteria for "all Denied → straight to results-only" — covered implicitly: the orchestrator's empty-tasks no-op (Task 6 test) plus the sheet's filter (Task 11) → `running` phase has no rows to show, so the Done summary just lists the Excluded set. ✅
  - Acceptance criteria for "re-finalize with everything uploaded" — Task 11's filter `nonDeniedTaskIds(...).filter(id => !uploadedIssueKey)` produces an empty list; sheet's `canStart` becomes false (`tasks.length > 0` guard). ✅
- **Placeholder scan:** Re-read each step body. No "TBD", "implement later", or "add appropriate error handling" without showing the code. ✅
- **Type consistency:**
  - `UploadTask`, `UploadDestination`, `BatchResult`, `RowState` types defined in Task 5 are referenced by name in Tasks 6, 7, 8, 11. ✅
  - `buildTaskGraphMermaid({ tasks, reviews, assignees? })` signature matches between Task 3 (definition), Task 4 (component test), and Task 9 (ReviewerMode call site). ✅
  - `UploadSheet` Props (`tasks, denied, onCancel, onPersistUploaded`) are stable between Tasks 7, 8, 11. ✅
  - `ReviewerMode` new `onFinalize` prop signature matches between Task 9 (component) and Task 11 (parent). ✅
  - `nonDeniedTaskIds(map, ids)` argument order matches between Task 1 and Task 11. ✅
- **Commit hygiene:** every commit message ends with the required `Co-Authored-By` trailer; every commit uses targeted `git add`; no commit touches `prompts/types/*`. ✅
