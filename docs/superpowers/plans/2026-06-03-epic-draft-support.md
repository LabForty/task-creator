# Epic-Draft Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing draft feature (save / open-hydrate / dashboard / finalize-delete) also work for epic mode, without regressing single-task drafts.

**Architecture:** One self-contained Supabase row per epic draft — the `payload` jsonb carries `{ mode:'epic', knead, epicTasks, subtaskDrafts }` (subtask bodies bundled by task id). Pure assemble/apply/predicate helpers live in `lib/drafts/epic.ts` so the 1300-line `StandaloneApp.tsx` stays thin and the logic is unit-testable. No DB migration (jsonb + `mode` column already exist).

**Tech Stack:** Next.js (App Router), React 19, TypeScript, Zod v4, Supabase (service-role, server-only), Vitest + Testing Library.

**Conventions:** Tests live under `tests/` mirroring source, importing via the `@/` alias. Run a single test with `npx vitest run <path> -t "<name>"`. After branch/route churn, if typecheck shows phantom route validators, `rm -rf .next/types .next/dev/types` first.

---

## File Structure

- `lib/draft/autosave.ts` — **modify**: add optional `subtaskDrafts?: Record<string, Draft>` to the `Draft` type.
- `lib/drafts/schemas.ts` — **modify**: accept `knead`, `epicTasks`, `subtaskDrafts` (loosely, value-preserving).
- `lib/drafts/epic.ts` — **create**: `buildEpicDraftPayload`, `applyEpicDraft`, `shouldDeleteEpicDraftOnClose` (pure).
- `lib/drafts/payload.ts` — **modify**: make `deriveWorkingTitle` + `derivePreview` mode-aware for epic.
- `components/drafts/DraftCard.tsx` — **modify**: render a mode chip; epic preview already arrives via `item.preview`.
- `components/StandaloneApp.tsx` — **modify**: epic branch in `saveAsDraft`, a header "Save as draft" button for epic-with-tasks, epic branch in the `?draft=` open handler, and finalize-delete on `UploadSheet` close.

Tasks 1–4 are pure/unit TDD. Tasks 5–7 are wiring whose logic is already covered by the Task 2–4 pure helpers (the React-19 controlled-input Playwright quirk noted in the handoff blocks type→save e2e); they are verified by typecheck + lint + the full existing suite staying green, then the live Supabase smoke in Task 8.

---

### Task 1: Extend the `Draft` type and upsert schema

**Files:**
- Modify: `lib/draft/autosave.ts` (the `Draft` type, currently lines 5–20)
- Modify: `lib/drafts/schemas.ts:5-15`
- Test: `tests/lib/drafts/schemas.test.ts`

- [ ] **Step 1: Write the failing tests** — append to `tests/lib/drafts/schemas.test.ts` inside the existing `describe`:

```ts
  it("preserves epic fields (knead, epicTasks, subtaskDrafts)", () => {
    const input = {
      mode: "epic" as const,
      knead: { status: "complete", rounds: [] },
      epicTasks: [{ id: "t1", title: "First", labels: [], blocks: [], blockedBy: [] }],
      subtaskDrafts: { t1: { title: "First", description: "body", mode: "single" } },
    };
    const r = DraftUpsertSchema.safeParse(input);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.mode).toBe("epic");
      expect(r.data.knead).toEqual(input.knead);
      expect(r.data.epicTasks).toEqual(input.epicTasks);
      expect(r.data.subtaskDrafts).toEqual(input.subtaskDrafts);
    }
  });
  it("strips genuinely unknown top-level keys", () => {
    const r = DraftUpsertSchema.safeParse({ title: "x", bogus: 1 });
    expect(r.success).toBe(true);
    if (r.success) expect("bogus" in r.data).toBe(false);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/lib/drafts/schemas.test.ts -t "epic fields"`
Expected: FAIL — `knead`/`epicTasks`/`subtaskDrafts` are stripped, so the `toEqual` assertions fail (received `undefined`).

- [ ] **Step 3: Extend the schema** — in `lib/drafts/schemas.ts`, replace the `mode` line and its comment (lines 13–14) with:

```ts
  mode: z.enum(["single", "epic"]).optional(),
  // Epic-draft fields. Validated loosely (value-preserving) so the draft schema
  // stays decoupled from evolving knead/epic internals; bounds are size guards.
  knead: z.unknown().optional(),
  epicTasks: z.array(z.unknown()).max(500).optional(),
  subtaskDrafts: z.record(z.string(), z.unknown()).optional(),
```

- [ ] **Step 4: Add `subtaskDrafts` to the `Draft` type** — in `lib/draft/autosave.ts`, inside the `Draft` type after the `epicTasks?: EpicTask[];` line, add:

```ts
  // Bundled per-subtask drafts, keyed by epic task id. Populated only in the
  // server payload for epic drafts; the live local store keeps subtasks in
  // their own `standalone:epic:<id>` namespaces.
  subtaskDrafts?: Record<string, Draft>;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/drafts/schemas.test.ts`
Expected: PASS (all, including the two new cases).

- [ ] **Step 6: Commit**

```bash
git add lib/draft/autosave.ts lib/drafts/schemas.ts tests/lib/drafts/schemas.test.ts
git commit -m "feat(AI-33): accept epic fields in draft schema + Draft type"
```

---

### Task 2: Pure epic helpers — assemble, apply, delete-predicate

**Files:**
- Create: `lib/drafts/epic.ts`
- Test: `tests/lib/drafts/epic.test.ts`

- [ ] **Step 1: Write the failing tests** — create `tests/lib/drafts/epic.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { EMPTY_DRAFT, type Draft } from "@/lib/draft/autosave";
import { EMPTY_KNEAD, type KneadState } from "@/lib/knead/types";
import type { EpicTask } from "@/lib/epic/tasks";
import {
  buildEpicDraftPayload,
  applyEpicDraft,
  shouldDeleteEpicDraftOnClose,
} from "@/lib/drafts/epic";

const base: Draft = { ...EMPTY_DRAFT, title: "My Epic", description: "epic desc", mode: "epic" };
const knead: KneadState = { status: "complete", rounds: [] };
const tasks: EpicTask[] = [
  { id: "t1", title: "First", labels: [], blocks: [], blockedBy: [] },
  { id: "t2", title: "Second", labels: [], blocks: [], blockedBy: [] },
];
const subtaskDrafts: Record<string, Draft> = {
  t1: { ...EMPTY_DRAFT, title: "First", description: "one", chatHistory: [{ role: "user", content: "hi" }] as any },
  t2: { ...EMPTY_DRAFT, title: "Second", description: "two" },
};

describe("buildEpicDraftPayload", () => {
  it("attaches mode/knead/epicTasks/subtaskDrafts and preserves base fields", () => {
    const p = buildEpicDraftPayload(base, knead, tasks, subtaskDrafts);
    expect(p.mode).toBe("epic");
    expect(p.title).toBe("My Epic");
    expect(p.knead).toEqual(knead);
    expect(p.epicTasks).toEqual(tasks);
    expect(p.subtaskDrafts).toEqual(subtaskDrafts);
  });
});

describe("applyEpicDraft", () => {
  it("round-trips a built payload back into hydration data", () => {
    const p = buildEpicDraftPayload(base, knead, tasks, subtaskDrafts);
    const applied = applyEpicDraft(p);
    expect(applied.mainDraft.mode).toBe("epic");
    expect(applied.mainDraft.title).toBe("My Epic");
    expect(applied.mainDraft.knead).toEqual(knead);
    expect(applied.mainDraft.epicTasks).toEqual(tasks);
    expect(applied.epicTasks).toEqual(tasks);
    expect(applied.subtaskDrafts).toEqual(subtaskDrafts);
    expect(applied.analyzeChatById.t1).toHaveLength(1);
    expect(applied.analyzeChatById.t2).toBeUndefined();
  });
  it("defaults knead and collections when payload is sparse", () => {
    const applied = applyEpicDraft({ mode: "epic" });
    expect(applied.knead).toEqual(EMPTY_KNEAD);
    expect(applied.epicTasks).toEqual([]);
    expect(applied.subtaskDrafts).toEqual({});
    expect(applied.analyzeChatById).toEqual({});
  });
});

describe("shouldDeleteEpicDraftOnClose", () => {
  it("is false when there is no draftId", () => {
    expect(shouldDeleteEpicDraftOnClose(null, tasks)).toBe(false);
  });
  it("is false when no task has uploaded", () => {
    expect(shouldDeleteEpicDraftOnClose("d1", tasks)).toBe(false);
  });
  it("is true when at least one task uploaded", () => {
    const uploaded = [{ ...tasks[0], uploadedIssueKey: "PROJ-1" }, tasks[1]];
    expect(shouldDeleteEpicDraftOnClose("d1", uploaded)).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/lib/drafts/epic.test.ts`
Expected: FAIL — `@/lib/drafts/epic` does not exist (import/resolve error).

- [ ] **Step 3: Implement the helpers** — create `lib/drafts/epic.ts`:

```ts
import { EMPTY_DRAFT, type Draft } from "@/lib/draft/autosave";
import { EMPTY_KNEAD, type KneadState } from "@/lib/knead/types";
import type { EpicTask } from "@/lib/epic/tasks";
import type { HelpMessage } from "@/lib/jobs/types";

export type EpicDraftPayload = Partial<Draft> & {
  mode: "epic";
  knead?: KneadState;
  epicTasks?: EpicTask[];
  subtaskDrafts?: Record<string, Draft>;
};

// Assemble the full epic snapshot for the server payload. `base` is the
// epic-level editor draft (title/description); subtaskDrafts is the map already
// read from each `standalone:epic:<id>` namespace.
export function buildEpicDraftPayload(
  base: Draft,
  knead: KneadState,
  epicTasks: EpicTask[],
  subtaskDrafts: Record<string, Draft>,
): EpicDraftPayload {
  return { ...base, mode: "epic", knead, epicTasks, subtaskDrafts };
}

export type AppliedEpicDraft = {
  mainDraft: Draft;
  knead: KneadState;
  epicTasks: EpicTask[];
  subtaskDrafts: Record<string, Draft>;
  analyzeChatById: Record<string, HelpMessage[]>;
};

// Turn a stored epic payload back into the data the component needs to hydrate:
// the main NAMESPACE draft, knead/epicTasks state, the per-namespace subtask
// drafts to write, and the per-task chat threads.
export function applyEpicDraft(payload: Partial<Draft>): AppliedEpicDraft {
  const knead = (payload.knead as KneadState | undefined) ?? EMPTY_KNEAD;
  const epicTasks = (payload.epicTasks as EpicTask[] | undefined) ?? [];
  const subtaskDrafts = payload.subtaskDrafts ?? {};
  const mainDraft: Draft = { ...EMPTY_DRAFT, ...payload, mode: "epic", knead, epicTasks };
  const analyzeChatById: Record<string, HelpMessage[]> = {};
  for (const t of epicTasks) {
    const chat = subtaskDrafts[t.id]?.chatHistory;
    if (chat && chat.length > 0) analyzeChatById[t.id] = chat;
  }
  return { mainDraft, knead, epicTasks, subtaskDrafts, analyzeChatById };
}

// Epic draft is deleted when the upload sheet closes after >=1 task uploaded.
// (Uploaded tasks already persist their issue key in Jira; a pure cancel with
// zero uploads keeps the draft.)
export function shouldDeleteEpicDraftOnClose(
  draftId: string | null,
  epicTasks: EpicTask[],
): boolean {
  if (!draftId) return false;
  return epicTasks.some((t) => Boolean(t.uploadedIssueKey));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/drafts/epic.test.ts`
Expected: PASS (all 6).

- [ ] **Step 5: Commit**

```bash
git add lib/drafts/epic.ts tests/lib/drafts/epic.test.ts
git commit -m "feat(AI-33): pure epic-draft assemble/apply/delete helpers"
```

---

### Task 3: Mode-aware working-title and preview derivation

**Files:**
- Modify: `lib/drafts/payload.ts:21-39`
- Test: `tests/lib/drafts/payload.test.ts`

Note: the epic title is the epic-level editor draft's `title`, stored as `payload.title`. So working-title order is: `payload.title` → first task title → `"Untitled epic"`. (This refines the spec's §4, which listed `knead.sourceDescription` before the title was confirmed to live in `payload.title`.)

- [ ] **Step 1: Write the failing tests** — append to `tests/lib/drafts/payload.test.ts` (use existing imports; add any missing):

```ts
import { deriveWorkingTitle, derivePreview } from "@/lib/drafts/payload";

describe("epic derivations", () => {
  it("working title uses the epic title when present", () => {
    expect(deriveWorkingTitle({ mode: "epic", title: "Checkout revamp" })).toBe("Checkout revamp");
  });
  it("working title falls back to the first task title", () => {
    expect(
      deriveWorkingTitle({ mode: "epic", title: "", epicTasks: [{ id: "t1", title: "Wire API" }] as any }),
    ).toBe("Wire API");
  });
  it("working title falls back to 'Untitled epic' when nothing is set", () => {
    expect(deriveWorkingTitle({ mode: "epic" })).toBe("Untitled epic");
  });
  it("preview shows task count for epics", () => {
    expect(derivePreview({ mode: "epic", epicTasks: [{}, {}, {}] as any })).toBe("3 tasks");
    expect(derivePreview({ mode: "epic", epicTasks: [{}] as any })).toBe("1 task");
    expect(derivePreview({ mode: "epic" })).toBe("0 tasks");
  });
  it("single-mode derivations are unchanged", () => {
    expect(deriveWorkingTitle({ title: "Hello" })).toBe("Hello");
    expect(deriveWorkingTitle({})).toBe("Untitled draft");
    expect(derivePreview({ description: "<p>Hi there</p>" })).toBe("Hi there");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/lib/drafts/payload.test.ts -t "epic derivations"`
Expected: FAIL — epic working title returns `"Untitled draft"`, epic preview returns the (empty) description text, not `"N tasks"`.

- [ ] **Step 3: Make derivations mode-aware** — in `lib/drafts/payload.ts`, replace `deriveWorkingTitle` (lines 21–24) and `derivePreview` (lines 35–39) with:

```ts
export function deriveWorkingTitle(payload: Partial<Draft>): string {
  const t = (payload.title ?? "").trim();
  if (t) return t;
  if (payload.mode === "epic") {
    const first = (payload.epicTasks?.[0]?.title ?? "").trim();
    return first || "Untitled epic";
  }
  return "Untitled draft";
}
```

```ts
export function derivePreview(payload: Partial<Draft>): string {
  if (payload.mode === "epic") {
    const n = payload.epicTasks?.length ?? 0;
    return n === 1 ? "1 task" : `${n} tasks`;
  }
  const text = stripHtml(payload.description ?? "");
  if (text.length <= PREVIEW_MAX) return text;
  return text.slice(0, PREVIEW_MAX - 1).trimEnd() + "…";
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/drafts/payload.test.ts`
Expected: PASS (existing + new).

- [ ] **Step 5: Commit**

```bash
git add lib/drafts/payload.ts tests/lib/drafts/payload.test.ts
git commit -m "feat(AI-33): epic-aware working-title and preview derivation"
```

---

### Task 4: Mode chip on the dashboard card

**Files:**
- Modify: `components/drafts/DraftCard.tsx:20-26`
- Test: `tests/components/drafts/DraftCard.test.tsx`

- [ ] **Step 1: Write the failing tests** — append to `tests/components/drafts/DraftCard.test.tsx`:

```ts
  it("renders an Epic chip and task-count preview for epic drafts", () => {
    const epic = { id: "e1", workingTitle: "Checkout revamp", mode: "epic", updatedAt: "2026-06-03T11:30:00Z", preview: "3 tasks" };
    render(<DraftCard item={epic} now={new Date("2026-06-03T12:00:00Z").getTime()} onDelete={() => {}} />);
    expect(screen.getByText("Epic")).toBeInTheDocument();
    expect(screen.getByText("3 tasks")).toBeInTheDocument();
  });
  it("renders a Single chip for single drafts", () => {
    render(<DraftCard item={ITEM} now={Date.now()} onDelete={() => {}} />);
    expect(screen.getByText("Single")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/components/drafts/DraftCard.test.tsx -t "chip"`
Expected: FAIL — no "Epic"/"Single" text rendered.

- [ ] **Step 3: Render the chip** — in `components/drafts/DraftCard.tsx`, replace the title row (lines 21–26) with:

```tsx
      <div className="flex items-start gap-3">
        <h3 className="text-hig-headline flex-1 min-w-0 truncate">{item.workingTitle}</h3>
        <span className="text-hig-footnote text-ink-secondary shrink-0">
          {formatRelativeTime(item.updatedAt, effectiveNow)}
        </span>
      </div>
      <span
        className={
          "self-start rounded-full px-2 py-0.5 text-hig-caption font-medium " +
          (item.mode === "epic"
            ? "bg-accent-tint text-accent"
            : "bg-surface-muted text-ink-secondary")
        }
      >
        {item.mode === "epic" ? "Epic" : "Single"}
      </span>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/drafts/DraftCard.test.tsx`
Expected: PASS (existing + new).

- [ ] **Step 5: Commit**

```bash
git add components/drafts/DraftCard.tsx tests/components/drafts/DraftCard.test.tsx
git commit -m "feat(AI-33): mode chip on draft cards"
```

---

### Task 5: Save epic drafts (saveAsDraft branch + header Save button)

**Files:**
- Modify: `components/StandaloneApp.tsx` — imports (line 33), `saveAsDraft` (892–919), header (after the Drafts link, ~997)

There is no save affordance in `EpicEditingView`, so once epic tasks exist the in-Editor Save button is gone. Add a header "Save as draft" button shown for `epicMode && epicTasks.length > 0 && mode.kind === "idle"`. The shared upsert is extracted so single mode behaves identically.

- [ ] **Step 1: Extend the drafts import** — in `components/StandaloneApp.tsx:33`, replace:

```ts
import { upsertRequest, deleteDraftRequest } from "@/lib/drafts/client";
```

with:

```ts
import { upsertRequest, deleteDraftRequest } from "@/lib/drafts/client";
import { buildEpicDraftPayload, applyEpicDraft, shouldDeleteEpicDraftOnClose } from "@/lib/drafts/epic";
```

- [ ] **Step 2: Replace `saveAsDraft` with a shared upsert + epic branch** — replace the whole function (892–919) with:

```tsx
  function epicPayloadFromState(base: Draft): Partial<Draft> {
    const subtaskDrafts: Record<string, Draft> = {};
    for (const t of epicTasks) subtaskDrafts[t.id] = loadDraft(epicTaskNamespace(t.id));
    return buildEpicDraftPayload(base, knead, epicTasks, subtaskDrafts);
  }

  async function persistDraftPayload(payload: Partial<Draft>) {
    setDraftSavedNote(null);
    const { url, method } = upsertRequest(draftId);
    try {
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ draft: payload }),
      });
      if (res.status === 401) {
        window.location.href = `/signin?return=${encodeURIComponent("/")}`;
        return;
      }
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setSubmitErr(typeof json.error === "string" ? json.error : "We couldn't save your draft.");
        return;
      }
      if (method === "POST") {
        const json = await res.json().catch(() => ({}));
        if (typeof json.id === "string") setDraftId(json.id);
      }
      setDraftSavedNote("Draft saved. You can safely leave this page.");
    } catch {
      setSubmitErr("We couldn't save your draft. Please check your connection and try again.");
    }
  }

  // Editor entry point (single mode, and epic before sub-tasks exist).
  async function saveAsDraft(draft: Draft) {
    await persistDraftPayload(epicMode ? epicPayloadFromState(draft) : draft);
  }

  // Header entry point (epic mode once sub-tasks exist and the Editor is hidden).
  function saveEpicDraft() {
    void persistDraftPayload(epicPayloadFromState(loadDraft(NAMESPACE)));
  }
```

- [ ] **Step 3: Add the header Save button** — in `components/StandaloneApp.tsx`, immediately after the Drafts link `</a>` (line 997, before `<ThemeToggle />`), insert:

```tsx
          {epicMode && epicTasks.length > 0 && mode.kind === "idle" && (
            <Button variant="secondary" onClick={saveEpicDraft}>
              Save as draft
            </Button>
          )}
```

- [ ] **Step 4: Verify it compiles and nothing regressed**

Run: `rm -rf .next/types .next/dev/types; npm run typecheck && npx vitest run tests/components/Editor.savedraft.test.tsx`
Expected: typecheck PASS; the existing single-mode save test PASSES (saveAsDraft signature unchanged for the Editor).

- [ ] **Step 5: Commit**

```bash
git add components/StandaloneApp.tsx
git commit -m "feat(AI-33): save epic drafts (saveAsDraft branch + header button)"
```

---

### Task 6: Open and hydrate epic drafts

**Files:**
- Modify: `components/StandaloneApp.tsx:561-568` (the `?draft=` open handler)

- [ ] **Step 1: Branch the open handler on mode** — replace lines 561–568 (the `if (res.ok) { ... }` block) with:

```tsx
          if (res.ok) {
            const json = await res.json();
            const payload = (json?.draft?.payload ?? {}) as Partial<Draft>;
            if (payload.mode === "epic") {
              const applied = applyEpicDraft(payload);
              saveDraft(NAMESPACE, applied.mainDraft);
              for (const [id, d] of Object.entries(applied.subtaskDrafts)) {
                saveDraft(epicTaskNamespace(id), d);
              }
              if (!cancelled) {
                modeTouchedRef.current = true; // opening an epic locks the mode
                setEpicMode(true);
                setKnead(applied.knead);
                setEpicTasks(applied.epicTasks);
                setAnalyzeChatById(applied.analyzeChatById);
                setDraftId(draftParam);
                setDraftReloadToken((t) => t + 1);
              }
            } else {
              saveDraft(NAMESPACE, { ...EMPTY_DRAFT, ...payload });
              if (!cancelled) {
                setDraftId(draftParam);
                setDraftReloadToken((t) => t + 1);
              }
            }
          } else if (!cancelled) {
```

(The trailing `} else if (!cancelled) {` line is the existing line 569 — keep it; this replacement ends just before it. Ensure exactly one `} else if (!cancelled) {` remains.)

- [ ] **Step 2: Verify it compiles and the existing open test still passes**

Run: `rm -rf .next/types .next/dev/types; npm run typecheck && npx vitest run tests/components/drafts/DraftsView.test.tsx`
Expected: typecheck PASS; existing tests PASS.

- [ ] **Step 3: Commit**

```bash
git add components/StandaloneApp.tsx
git commit -m "feat(AI-33): open and hydrate epic drafts (restore knead/tasks/subtasks)"
```

---

### Task 7: Finalize-delete on epic upload-sheet close

**Files:**
- Modify: `components/StandaloneApp.tsx:1350` (`UploadSheet onCancel`)

- [ ] **Step 1: Add the delete-on-close handler** — replace the `onCancel` line (1350):

```tsx
            onCancel={() => setUploadOpen(false)}
```

with:

```tsx
            onCancel={() => {
              setUploadOpen(false);
              if (shouldDeleteEpicDraftOnClose(draftId, epicTasks)) {
                const { url, method } = deleteDraftRequest(draftId as string);
                void fetch(url, { method, credentials: "same-origin" }).catch(() => {
                  /* best-effort cleanup; the draft simply remains listed */
                });
                setDraftId(null);
              }
            }}
```

- [ ] **Step 2: Verify it compiles**

Run: `rm -rf .next/types .next/dev/types; npm run typecheck`
Expected: PASS. (The predicate is already unit-tested in Task 2.)

- [ ] **Step 3: Commit**

```bash
git add components/StandaloneApp.tsx
git commit -m "feat(AI-33): delete epic draft on upload-sheet close after >=1 upload"
```

---

### Task 8: Full verification + live Supabase smoke

**Files:**
- Temporary: `scripts/epic-draft-smoke.mjs` (created, run, then deleted — not committed)

- [ ] **Step 1: Lint, typecheck, full test suite**

Run: `rm -rf .next/types .next/dev/types; npm run lint && npm run typecheck && npm test`
Expected: lint clean, typecheck clean, all tests green (≥453 baseline + the new cases; 2 skipped). If a transient async-teardown "2 errors" vitest blip appears with exit 0, re-run once to confirm it doesn't recur.

- [ ] **Step 2: Write the live smoke script** — create `scripts/epic-draft-smoke.mjs`:

```js
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
const db = createClient(url, key);

const OWNER = "smoke-epic-owner";
const payload = {
  mode: "epic",
  title: "Smoke Epic",
  description: "epic desc",
  knead: { status: "complete", rounds: [] },
  epicTasks: [
    { id: "t1", title: "First", labels: [], blocks: [], blockedBy: [] },
    { id: "t2", title: "Second", labels: [], blocks: [], blockedBy: [] },
  ],
  subtaskDrafts: {
    t1: { title: "First", description: "one", mode: "single" },
    t2: { title: "Second", description: "two", mode: "single" },
  },
};

const ins = await db
  .from("drafts")
  .insert({ owner_account_id: OWNER, mode: "epic", working_title: "Smoke Epic", payload })
  .select("id")
  .single();
if (ins.error) throw ins.error;
const id = ins.data.id;

const got = await db.from("drafts").select("mode, payload").eq("id", id).single();
if (got.error) throw got.error;
const ok =
  got.data.mode === "epic" &&
  got.data.payload.epicTasks.length === 2 &&
  got.data.payload.subtaskDrafts.t1.description === "one" &&
  got.data.payload.knead.status === "complete";

await db.from("drafts").delete().eq("id", id);
const after = await db.from("drafts").select("id").eq("id", id).maybeSingle();

console.log(JSON.stringify({ roundTrip: ok, deleted: after.data === null }));
if (!ok || after.data !== null) process.exit(1);
```

- [ ] **Step 2: Run the smoke script**

Run: `node --env-file=.env.local scripts/epic-draft-smoke.mjs`
Expected: `{"roundTrip":true,"deleted":true}` and exit 0.

- [ ] **Step 3: Delete the throwaway script**

```bash
rm scripts/epic-draft-smoke.mjs
```

- [ ] **Step 4: Final commit (if anything outstanding) and proceed to merge**

The branch is now ready. Use `superpowers:finishing-a-development-branch` to merge `AI-33-drafts-epic` → `main` (one combined branch, per the project decision — do NOT merge AI-36 separately).

---

## Self-Review

**Spec coverage:**
- §1 schema gap → Task 1. ✓
- §2 save → Task 5 (epic branch + header button; UI gap resolved). ✓
- §3 open/hydrate → Task 6 (+ `applyEpicDraft` in Task 2). ✓
- §4 dashboard badge/preview → Tasks 3 (derivation) + 4 (chip). ✓ (working-title order refined: `payload.title` → first task title → "Untitled epic"; documented in Task 3.)
- §5 finalize-delete → Task 7 (+ predicate in Task 2). ✓
- §6 pure helpers → Task 2 (placed in `lib/drafts/epic.ts`, a dedicated file, rather than `payload.ts` — cleaner single-responsibility; noted in File Structure). ✓
- Testing → unit tests in Tasks 1–4; wiring verified by typecheck/lint/suite + live smoke in Task 8. ✓
- Verification → Task 8. ✓

**Placeholder scan:** none — every code/command step is concrete.

**Type consistency:** `buildEpicDraftPayload(base, knead, epicTasks, subtaskDrafts)`, `applyEpicDraft(payload) → {mainDraft, knead, epicTasks, subtaskDrafts, analyzeChatById}`, `shouldDeleteEpicDraftOnClose(draftId, epicTasks)` — names/signatures match between `lib/drafts/epic.ts` (Task 2), its tests, and the call sites (Tasks 5–7). `Draft.subtaskDrafts` added in Task 1 is consumed in Tasks 2/5/6. ✓
