# Epic Mode — Review Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-task review statuses (Approved/Denied/Change-requested + comment) to the bake/reviewer flow and disable "Upload all to Jira" until every task is Approved or Denied, excluding Denied tasks from the upload.

**Architecture:** Review status + comment are stored as optional fields on the existing `EpicTask` descriptor (rides the existing draft autosave). Pure helpers in `lib/epic/review.ts` derive completeness and the upload/denied partitions. A new `TaskReviewBar` renders above the task preview; `BakeNav` shows a status color dot + 💬 comment marker and gates the upload button; `StandaloneApp` wires handlers and feeds the approved/denied partition into the existing `UploadSheet`.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-06-01-epic-mode-review-gate-design.md`

---

## File Structure

- `lib/epic/tasks.ts` — **modify**: add `ReviewStatus` type + `reviewStatus?`/`reviewComment?` fields to `EpicTask`.
- `lib/epic/review.ts` — **create**: pure helpers (`setReviewStatus`, `setReviewComment`, `isReviewComplete`, `tasksForUpload`, `deniedTasks`).
- `tests/lib/epic/review.test.ts` — **create**: unit tests for the helpers.
- `components/epic/review/TaskReviewBar.tsx` — **create**: the review controls (status buttons + comment).
- `tests/components/epic/review/TaskReviewBar.test.tsx` — **create**.
- `components/epic/bake/BakeNav.tsx` — **modify**: status color dot, 💬 marker, `uploadDisabled` gate + hint.
- `tests/components/epic/bake/BakeNav.test.tsx` — **modify**.
- `components/epic/bake/BakeView.tsx` — **modify**: render `TaskReviewBar` above the selected-task preview; thread review props.
- `tests/components/epic/bake/BakeView.test.tsx` — **modify** (add review-bar assertions).
- `components/StandaloneApp.tsx` — **modify**: review handlers, gate, approved/denied partition into `UploadSheet`.
- `tests/components/StandaloneApp.epic.test.tsx` — **modify** (gating + denied exclusion + persistence).

---

## Task 1: Data model + pure review helpers

**Files:**
- Modify: `lib/epic/tasks.ts` (type + fields)
- Create: `lib/epic/review.ts`
- Test: `tests/lib/epic/review.test.ts`

- [ ] **Step 1: Add the type + fields to `EpicTask`**

In `lib/epic/tasks.ts`, add the exported type just above `export type EpicTask`:

```ts
export type ReviewStatus = "approved" | "denied" | "change_requested";
```

And add these two optional fields inside the `EpicTask` type (after `uploadedIssueUrl?: string;`):

```ts
  // Reviewer-mode decision. undefined = not yet reviewed. Persisted in the draft.
  reviewStatus?: ReviewStatus;
  // Free-text reviewer comment; required only when reviewStatus === "change_requested".
  reviewComment?: string;
```

(`newEpicTask()` needs no change — both fields stay `undefined`.)

- [ ] **Step 2: Write the failing unit test**

Create `tests/lib/epic/review.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { EpicTask } from "@/lib/epic/tasks";
import {
  setReviewStatus, setReviewComment, isReviewComplete, tasksForUpload, deniedTasks,
} from "@/lib/epic/review";

function task(id: string, over: Partial<EpicTask> = {}): EpicTask {
  return { id, title: id.toUpperCase(), labels: [], blocks: [], blockedBy: [], ...over };
}

describe("review helpers", () => {
  it("setReviewStatus sets only the target task and is immutable", () => {
    const list = [task("a"), task("b")];
    const next = setReviewStatus(list, "a", "approved");
    expect(next).not.toBe(list);
    expect(next[0].reviewStatus).toBe("approved");
    expect(next[1].reviewStatus).toBeUndefined();
    expect(list[0].reviewStatus).toBeUndefined(); // original untouched
  });

  it("setReviewComment sets only the target task", () => {
    const next = setReviewComment([task("a"), task("b")], "b", "needs work");
    expect(next[1].reviewComment).toBe("needs work");
    expect(next[0].reviewComment).toBeUndefined();
  });

  it("isReviewComplete is false for an empty list", () => {
    expect(isReviewComplete([])).toBe(false);
  });

  it("isReviewComplete is false when any task is unreviewed or change_requested", () => {
    expect(isReviewComplete([task("a", { reviewStatus: "approved" }), task("b")])).toBe(false);
    expect(isReviewComplete([
      task("a", { reviewStatus: "approved" }),
      task("b", { reviewStatus: "change_requested", reviewComment: "x" }),
    ])).toBe(false);
  });

  it("isReviewComplete is true when every task is approved or denied", () => {
    expect(isReviewComplete([
      task("a", { reviewStatus: "approved" }),
      task("b", { reviewStatus: "denied" }),
    ])).toBe(true);
  });

  it("tasksForUpload returns only approved tasks", () => {
    const list = [
      task("a", { reviewStatus: "approved" }),
      task("b", { reviewStatus: "denied" }),
      task("c", { reviewStatus: "change_requested", reviewComment: "x" }),
      task("d"),
    ];
    expect(tasksForUpload(list).map((t) => t.id)).toEqual(["a"]);
  });

  it("deniedTasks returns id+title for denied tasks", () => {
    const list = [task("a", { reviewStatus: "approved" }), task("b", { reviewStatus: "denied" })];
    expect(deniedTasks(list)).toEqual([{ id: "b", title: "B" }]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- tests/lib/epic/review.test.ts`
Expected: FAIL — cannot resolve `@/lib/epic/review` (module not created yet).

- [ ] **Step 4: Implement `lib/epic/review.ts`**

```ts
import type { EpicTask, ReviewStatus } from "@/lib/epic/tasks";

// Pure transforms over the epic-task descriptor list, mirroring lib/epic/tasks.ts.
// Review status + comment live on EpicTask itself, so these ride the existing
// draft autosave with no extra persistence wiring.

export function setReviewStatus(list: EpicTask[], id: string, status: ReviewStatus): EpicTask[] {
  return list.map((t) => (t.id === id ? { ...t, reviewStatus: status } : t));
}

export function setReviewComment(list: EpicTask[], id: string, comment: string): EpicTask[] {
  return list.map((t) => (t.id === id ? { ...t, reviewComment: comment } : t));
}

// Upload is gated until every task is explicitly resolved. change_requested and
// unreviewed both keep the gate closed; an empty list is never "complete".
export function isReviewComplete(tasks: EpicTask[]): boolean {
  return tasks.length > 0 && tasks.every((t) => t.reviewStatus === "approved" || t.reviewStatus === "denied");
}

export function tasksForUpload(tasks: EpicTask[]): EpicTask[] {
  return tasks.filter((t) => t.reviewStatus === "approved");
}

export function deniedTasks(tasks: EpicTask[]): { id: string; title: string }[] {
  return tasks.filter((t) => t.reviewStatus === "denied").map((t) => ({ id: t.id, title: t.title }));
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- tests/lib/epic/review.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/epic/tasks.ts lib/epic/review.ts tests/lib/epic/review.test.ts
git commit -m "feat(AI-36): add EpicTask review status/comment + pure review helpers"
```

---

## Task 2: TaskReviewBar component

**Files:**
- Create: `components/epic/review/TaskReviewBar.tsx`
- Test: `tests/components/epic/review/TaskReviewBar.test.tsx`

- [ ] **Step 1: Write the failing component test**

Create `tests/components/epic/review/TaskReviewBar.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskReviewBar } from "@/components/epic/review/TaskReviewBar";

const base = {
  status: undefined,
  comment: "",
  onStatusChange: () => {},
  onCommentChange: () => {},
};

describe("<TaskReviewBar>", () => {
  it("Approve and Deny apply immediately", async () => {
    const onStatusChange = vi.fn();
    render(<TaskReviewBar {...base} onStatusChange={onStatusChange} />);
    await userEvent.click(screen.getByRole("button", { name: /approve/i }));
    expect(onStatusChange).toHaveBeenCalledWith("approved");
    await userEvent.click(screen.getByRole("button", { name: /deny/i }));
    expect(onStatusChange).toHaveBeenCalledWith("denied");
  });

  it("Request change with an empty comment is blocked and shows an error", async () => {
    const onStatusChange = vi.fn();
    render(<TaskReviewBar {...base} comment="" onStatusChange={onStatusChange} />);
    await userEvent.click(screen.getByRole("button", { name: /request change/i }));
    expect(onStatusChange).not.toHaveBeenCalled();
    expect(screen.getByText(/comment is required/i)).toBeInTheDocument();
  });

  it("Request change applies once a comment is present", async () => {
    const onStatusChange = vi.fn();
    render(<TaskReviewBar {...base} comment="please split this" onStatusChange={onStatusChange} />);
    await userEvent.click(screen.getByRole("button", { name: /request change/i }));
    expect(onStatusChange).toHaveBeenCalledWith("change_requested");
  });

  it("typing fires onCommentChange", async () => {
    const onCommentChange = vi.fn();
    render(<TaskReviewBar {...base} onCommentChange={onCommentChange} />);
    await userEvent.type(screen.getByRole("textbox", { name: /review comment/i }), "x");
    expect(onCommentChange).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/components/epic/review/TaskReviewBar.test.tsx`
Expected: FAIL — cannot resolve `@/components/epic/review/TaskReviewBar`.

- [ ] **Step 3: Implement `components/epic/review/TaskReviewBar.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { ReviewStatus } from "@/lib/epic/tasks";

type Props = {
  status?: ReviewStatus;
  comment: string;
  onStatusChange: (status: ReviewStatus) => void;
  onCommentChange: (comment: string) => void;
};

export function TaskReviewBar({ status, comment, onStatusChange, onCommentChange }: Props) {
  const [commentError, setCommentError] = useState(false);

  function pick(next: ReviewStatus) {
    // Change-requested must carry a comment before it can be applied.
    if (next === "change_requested" && comment.trim().length === 0) {
      setCommentError(true);
      return;
    }
    setCommentError(false);
    onStatusChange(next);
  }

  return (
    <div className="border-b border-rule bg-surface px-6 py-3 flex flex-col gap-2 shrink-0">
      <div className="flex items-center gap-2">
        <span className="hig-section-label">Review</span>
        <span className="flex-1" />
        <Button
          size="sm"
          variant={status === "approved" ? "primary" : "secondary"}
          aria-pressed={status === "approved"}
          onClick={() => pick("approved")}
        >
          Approve
        </Button>
        <Button
          size="sm"
          variant={status === "denied" ? "danger" : "secondary"}
          aria-pressed={status === "denied"}
          onClick={() => pick("denied")}
        >
          Deny
        </Button>
        <Button
          size="sm"
          variant={status === "change_requested" ? "primary" : "secondary"}
          aria-pressed={status === "change_requested"}
          onClick={() => pick("change_requested")}
        >
          Request change
        </Button>
      </div>
      <textarea
        value={comment}
        aria-label="Review comment"
        placeholder="Add a comment (required to request changes)…"
        onChange={(e) => {
          onCommentChange(e.target.value);
          if (commentError && e.target.value.trim().length > 0) setCommentError(false);
        }}
        className="w-full min-h-[60px] rounded-md border border-rule bg-surface px-3 py-2 text-hig-body resize-y"
      />
      {commentError && (
        <p className="text-hig-footnote text-danger">A comment is required to request changes.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/components/epic/review/TaskReviewBar.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add components/epic/review/TaskReviewBar.tsx tests/components/epic/review/TaskReviewBar.test.tsx
git commit -m "feat(AI-36): add TaskReviewBar review controls"
```

---

## Task 3: BakeNav status dot, comment marker, upload gate

**Files:**
- Modify: `components/epic/bake/BakeNav.tsx`
- Test: `tests/components/epic/bake/BakeNav.test.tsx`

- [ ] **Step 1: Add the failing assertions to the BakeNav test**

In `tests/components/epic/bake/BakeNav.test.tsx`, update the `tasks` fixture to carry review fields and add a new test block. Replace the existing `tasks` const with:

```ts
const tasks = [
  { id: "a", title: "Alpha", labels: [], blocks: [], blockedBy: [], reviewStatus: "approved" as const, reviewComment: "looks good" },
  { id: "b", title: "Bravo", labels: [], blocks: [], blockedBy: [], reviewStatus: "denied" as const },
];
```

Then add these tests inside the `describe("<BakeNav>")` block:

```ts
  it("shows a status color dot per task", () => {
    render(<BakeNav {...base} />);
    expect(screen.getByLabelText(/approved/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/denied/i)).toBeInTheDocument();
  });

  it("shows a comment marker when a task has a comment", () => {
    render(<BakeNav {...base} />);
    // Alpha has a comment, Bravo does not.
    expect(screen.getAllByLabelText(/has comment/i)).toHaveLength(1);
  });

  it("disables Upload all and shows the hint when uploadDisabled", () => {
    render(<BakeNav {...base} uploadDisabled />);
    expect(screen.getByRole("button", { name: /upload all to jira/i })).toBeDisabled();
    expect(screen.getByText(/review all the tasks and resolve requested changes/i)).toBeInTheDocument();
  });

  it("enables Upload all when not disabled", () => {
    render(<BakeNav {...base} uploadDisabled={false} />);
    expect(screen.getByRole("button", { name: /upload all to jira/i })).toBeEnabled();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/components/epic/bake/BakeNav.test.tsx`
Expected: FAIL — no dot/marker rendered, `uploadDisabled` prop ignored.

- [ ] **Step 3: Implement the BakeNav changes**

In `components/epic/bake/BakeNav.tsx`:

(a) Update the import + `Props` to add `uploadDisabled` (tasks already carry the review fields via `EpicTask`):

```tsx
import { Button } from "@/components/ui/Button";
import type { EpicTask, ReviewStatus } from "@/lib/epic/tasks";

type Props = {
  tasks: EpicTask[];
  selectedId: "epic" | string;
  finalizedIds: Set<string>;
  failedIds: Record<string, string>;
  onSelect: (id: "epic" | string) => void;
  onUploadAll: () => void;
  onBackToEditing: () => void;
  uploadDisabled?: boolean;
};
```

(b) Add a status-dot helper above the `BakeNav` function (after `entryClass`):

```tsx
function statusDot(status?: ReviewStatus): { cls: string; label: string } {
  switch (status) {
    case "approved": return { cls: "bg-success", label: "approved" };
    case "denied": return { cls: "bg-danger", label: "denied" };
    case "change_requested": return { cls: "bg-warning", label: "change requested" };
    default: return { cls: "bg-rule", label: "not reviewed" };
  }
}
```

(c) In the `props.tasks.map(...)` body, replace the inner `<span className="flex items-center gap-2">…</span>` with one that leads with the dot and appends a 💬 marker when a comment exists:

```tsx
              <span className="flex items-center gap-2">
                {(() => {
                  const dot = statusDot(t.reviewStatus);
                  return <span className={`h-2 w-2 rounded-full shrink-0 ${dot.cls}`} aria-label={dot.label} />;
                })()}
                <span className="flex-1 truncate">{t.title || "(untitled)"}</span>
                {t.reviewComment && t.reviewComment.trim().length > 0 && (
                  <span className="text-ink-secondary text-[12px]" aria-label="has comment" title="Has a review comment">💬</span>
                )}
                {baked && <span className="text-success text-[12px]" aria-label="baked">✓</span>}
                {failed && <span title={failed} className="text-danger text-[12px]" aria-label="failed">⨯</span>}
              </span>
```

(d) Update the footer to gate the upload button + show the hint:

```tsx
      <div className="p-3 border-t border-rule flex flex-col gap-2">
        <Button onClick={props.onUploadAll} disabled={props.uploadDisabled}>Upload all to Jira</Button>
        {props.uploadDisabled && (
          <p className="text-hig-footnote text-ink-secondary">
            You need to review all the tasks and resolve requested changes.
          </p>
        )}
        <Button variant="secondary" size="sm" onClick={props.onBackToEditing}>
          ← Back to editing
        </Button>
      </div>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/components/epic/bake/BakeNav.test.tsx`
Expected: PASS (existing tests + 4 new).

- [ ] **Step 5: Commit**

```bash
git add components/epic/bake/BakeNav.tsx tests/components/epic/bake/BakeNav.test.tsx
git commit -m "feat(AI-36): BakeNav shows review status dot + comment marker + upload gate"
```

---

## Task 4: Render TaskReviewBar in BakeView

**Files:**
- Modify: `components/epic/bake/BakeView.tsx`
- Test: `tests/components/epic/bake/BakeView.test.tsx`

- [ ] **Step 1: Read the existing BakeView test to learn its prop fixture**

Run: open `tests/components/epic/bake/BakeView.test.tsx`. Note the `base`/props object it renders with so the new props can be appended consistently. (Mirror its existing handler-stub style; do not invent a new fixture shape.)

- [ ] **Step 2: Add failing assertions for the review bar**

Add a test that selects a task and asserts the review bar appears, and that selecting the epic does NOT show it. Append inside the existing `describe`:

```tsx
  it("renders the review bar for a selected task and fires status changes", async () => {
    const onSetReviewStatus = vi.fn();
    render(
      <BakeView
        {...base}
        selectedId="a"
        onSetReviewStatus={onSetReviewStatus}
        onSetReviewComment={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /approve/i }));
    expect(onSetReviewStatus).toHaveBeenCalledWith("a", "approved");
  });

  it("does not render the review bar on the epic overview", () => {
    render(
      <BakeView {...base} selectedId="epic" onSetReviewStatus={() => {}} onSetReviewComment={() => {}} />,
    );
    expect(screen.queryByRole("button", { name: /request change/i })).not.toBeInTheDocument();
  });
```

> Note: ensure `vi` and `userEvent` are imported at the top of the test file. If the existing `base` fixture's `tasks` lack review fields, that is fine — `reviewStatus`/`reviewComment` are optional. The selected task `"a"` must exist in `base.tasks`; if not, add `{ id: "a", title: "Alpha", labels: [], blocks: [], blockedBy: [] }` to the fixture and set `finalizedById["a"]` to a minimal `FinalizedPayload` so the preview branch renders. Reuse whatever minimal `FinalizedPayload` shape the file already constructs for other tasks.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- tests/components/epic/bake/BakeView.test.tsx`
Expected: FAIL — `onSetReviewStatus` not a prop; no Approve button rendered.

- [ ] **Step 4: Implement the BakeView changes**

In `components/epic/bake/BakeView.tsx`:

(a) Add imports:

```tsx
import { TaskReviewBar } from "@/components/epic/review/TaskReviewBar";
import type { EpicTask, ReviewStatus } from "@/lib/epic/tasks";
```

(b) Add two props to the `Props` type:

```ts
  onSetReviewStatus: (id: string, status: ReviewStatus) => void;
  onSetReviewComment: (id: string, comment: string) => void;
```

(c) Wrap the selected-task preview branch so the review bar renders above it. Replace the `selectedFinalized ? (<BakeTaskPreview … />)` block with:

```tsx
        ) : selectedFinalized ? (
          <div className="min-h-0 flex flex-col">
            <TaskReviewBar
              status={selectedTask.reviewStatus}
              comment={selectedTask.reviewComment ?? ""}
              onStatusChange={(s) => props.onSetReviewStatus(selectedTask.id, s)}
              onCommentChange={(c) => props.onSetReviewComment(selectedTask.id, c)}
            />
            <BakeTaskPreview
              taskId={selectedTask.id}
              finalized={selectedFinalized}
              diagrams={props.diagramsById[selectedTask.id]}
              onCreateDiagrams={() => props.onCreateDiagrams(selectedTask.id)}
              creatingDiagrams={props.creatingForId === selectedTask.id}
              onEditDiagram={(f, s) => props.onEditDiagram(selectedTask.id, f, s)}
              onRegenerateDiagram={(f) => props.onRegenerateDiagram(selectedTask.id, f)}
              regeneratingFormat={props.regeneratingForId === selectedTask.id ? props.regeneratingFormat : null}
              onAnalyzeDiagrams={() => props.onAnalyzeDiagrams(selectedTask.id)}
              analyzingDiagrams={props.analyzingForId === selectedTask.id}
              analysisFindings={props.analysisFindings[selectedTask.id] ?? null}
              onApplyAnalysis={(ids) => props.onApplyAnalysis(selectedTask.id, ids)}
              applyingAnalysis={props.applyingForId === selectedTask.id}
              onDismissAnalysis={() => props.onDismissAnalysis(selectedTask.id)}
              onMarkdownChange={(next) => props.onMarkdownChange(selectedTask.id, next)}
            />
          </div>
        ) : (
```

(d) Pass `uploadDisabled` through to `BakeNav` — add the prop on the `<BakeNav ... />` element. Add a new prop to `Props`:

```ts
  uploadDisabled?: boolean;
```

and on the rendered `<BakeNav>`:

```tsx
        uploadDisabled={props.uploadDisabled}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- tests/components/epic/bake/BakeView.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/epic/bake/BakeView.tsx tests/components/epic/bake/BakeView.test.tsx
git commit -m "feat(AI-36): BakeView renders TaskReviewBar above task preview"
```

---

## Task 5: Wire StandaloneApp — handlers, gate, denied partition

**Files:**
- Modify: `components/StandaloneApp.tsx`
- Test: `tests/components/StandaloneApp.epic.test.tsx`

- [ ] **Step 1: Add review handlers + imports**

In `components/StandaloneApp.tsx`, extend the `lib/epic/review` import and the existing `lib/epic/tasks` import. Add near the other `lib/epic/tasks` import (line ~12):

```tsx
import { setReviewStatus, setReviewComment, isReviewComplete, tasksForUpload, deniedTasks } from "@/lib/epic/review";
import type { ReviewStatus } from "@/lib/epic/tasks";
```

Add two handlers next to `taskSetLabels`/`taskAddLink` (after line ~263), reusing the existing `commitEpicTasks` (which persists):

```tsx
  function setTaskReviewStatus(id: string, status: ReviewStatus) {
    commitEpicTasks(setReviewStatus(epicTasks, id, status));
  }
  function setTaskReviewComment(id: string, comment: string) {
    commitEpicTasks(setReviewComment(epicTasks, id, comment));
  }
```

- [ ] **Step 2: Pass review props + gate into BakeView**

On the `<BakeView ... />` element (around line 953), add:

```tsx
              onSetReviewStatus={setTaskReviewStatus}
              onSetReviewComment={setTaskReviewComment}
              uploadDisabled={!isReviewComplete(epicTasks)}
```

- [ ] **Step 3: Feed the approved/denied partition into UploadSheet**

Replace the `uploadOpen` IIFE body (lines ~1240–1259) so only approved tasks are uploaded and denied tasks are listed as excluded:

```tsx
      {uploadOpen && (() => {
        const approved = tasksForUpload(epicTasks);
        const uploadTasks: UploadTask[] = approved.map((t) => ({
          id: t.id,
          draft: loadDraft(epicTaskNamespace(t.id)),
          labels: t.labels,
          finalizedPayload: finalizedById[t.id],
          diagrams: diagramsById[t.id],
        }));
        return (
          <UploadSheet
            tasks={uploadTasks}
            denied={deniedTasks(epicTasks)}
            epicTitle={liveDraft?.title ?? ""}
            epicDescriptionHtml={liveDraft?.description ?? ""}
            epicDescriptionMarkdown={finalizedById["epic"]?.markdown}
            onCancel={() => setUploadOpen(false)}
            onPersistUploaded={persistUploadedKey}
          />
        );
      })()}
```

- [ ] **Step 4: Add the failing integration test**

Open `tests/components/StandaloneApp.epic.test.tsx` and study how it reaches the baked state (look for `bakeStatus`/"Upload all to Jira"/an existing helper that bakes). Add a test that mirrors the file's existing setup style to assert the gate + denied exclusion. Use this shape, adapting the "get to baked state" helper to whatever the file already uses:

```tsx
  it("gates upload until every task is approved or denied, and excludes denied", async () => {
    // ARRANGE: render and reach baked reviewer mode with >=2 tasks
    //   (reuse the file's existing 'bake' / setup helper).
    await renderBakedEpicWithTasks(["Alpha", "Bravo"]); // <- replace with the file's actual helper

    const uploadBtn = screen.getByRole("button", { name: /upload all to jira/i });
    expect(uploadBtn).toBeDisabled(); // nothing reviewed yet

    // Approve Alpha, Deny Bravo via the review bar (select each in the nav first).
    await userEvent.click(screen.getByRole("button", { name: /Alpha/ }));
    await userEvent.click(screen.getByRole("button", { name: /approve/i }));
    await userEvent.click(screen.getByRole("button", { name: /Bravo/ }));
    await userEvent.click(screen.getByRole("button", { name: /deny/i }));

    expect(uploadBtn).toBeEnabled();

    await userEvent.click(uploadBtn);
    // UploadSheet header confirms only 1 task uploads and 1 denied is excluded.
    expect(await screen.findByText(/1 task will be uploaded/i)).toBeInTheDocument();
    expect(screen.getByText(/1 denied task will be excluded/i)).toBeInTheDocument();
  });
```

> If the file has no reusable "reach baked state" helper, replicate the steps the file's other epic tests use to bake (they already exercise `bakeStatus === "baked"`), then continue from the nav. Keep assertions tied to user-visible text already produced by `BakeNav` and `UploadSheet` (the "{n} task(s) will be uploaded" / "denied task(s) will be excluded" strings come from `UploadSheet`'s destination phase).

- [ ] **Step 5: Run the integration test to verify it fails**

Run: `npm test -- tests/components/StandaloneApp.epic.test.tsx`
Expected: FAIL — upload button enabled prematurely / denied still counted, before the wiring is picked up (or, if wiring already compiled, the test fails on the missing review interactions until the prior tasks are integrated).

- [ ] **Step 6: Run the full test + typecheck to verify green**

Run: `npm test`
Expected: PASS (all suites).
Run: `npm run typecheck`
Expected: no errors.
Run: `npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/StandaloneApp.tsx tests/components/StandaloneApp.epic.test.tsx
git commit -m "feat(AI-36): gate Jira upload on full review + exclude denied tasks"
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Per-task status approved/denied/change_requested → Task 1 (model) + Task 2 (TaskReviewBar) + Task 4 (render). ✓
- Comment on any status, required for change_requested → Task 2 (`pick` guard + always-editable textarea). ✓
- Nav status color dot + 💬 marker → Task 3. ✓
- Upload disabled until all approved/denied + exact hint text → Task 3 (`uploadDisabled` + hint) + Task 5 (`isReviewComplete`). ✓
- Denied excluded from upload, approved uploaded, denied shown as excluded → Task 5 (`tasksForUpload`/`deniedTasks` into existing `UploadSheet`). ✓
- Persist in draft → Task 1 (fields on `EpicTask`) + Task 5 (handlers via `commitEpicTasks`, which already persists). ✓
- Re-knead resets review state → automatic: `commitEpicTasks(descriptorsFromProposed(...))` builds new descriptors without review fields (no task needed; noted in spec). ✓

**Placeholder scan:** No TBD/TODO. The only "adapt to existing fixture" notes are in Task 4/5 test steps, where the exact existing helper name cannot be known without reading the file at execution time; each gives the concrete assertions and fallback instructions. ✓

**Type consistency:** `ReviewStatus` defined in `lib/epic/tasks.ts` (Task 1) and imported everywhere (`review.ts`, `TaskReviewBar`, `BakeNav`, `BakeView`, `StandaloneApp`). Helper names — `setReviewStatus`, `setReviewComment`, `isReviewComplete`, `tasksForUpload`, `deniedTasks` — used identically across Tasks 1 and 5. BakeView props `onSetReviewStatus`/`onSetReviewComment`/`uploadDisabled` match StandaloneApp's call site and BakeNav's `uploadDisabled`. ✓
