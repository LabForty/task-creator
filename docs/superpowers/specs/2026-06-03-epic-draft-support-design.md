# Epic-Draft Support — Design

Date: 2026-06-03
Branch: `AI-33-drafts-epic`
Status: Approved (pending spec review)

## Goal

Extend the existing single-task draft feature (save / open / hydrate / dashboard / finalize-delete) so it **also works for epic mode**, without regressing single-task drafts. Ship as part of the combined `AI-33-drafts-epic` branch.

Single-task drafts are already complete and green. Epic state lives in `components/StandaloneApp.tsx` (`epicMode`, `knead: KneadState`, `epicTasks: EpicTask[]`) plus per-subtask draft content in localStorage namespaces `standalone:epic:<taskId>` (via `epicTaskNamespace(id)`). The server schema (`mode` column + `payload jsonb`) is already forward-compatible, so **no DB migration is required**.

## Persistence approach (chosen: A)

**A — Single self-contained server row with bundled subtask payloads.**
The main draft's `payload` jsonb holds the full epic snapshot:

```jsonc
{
  "mode": "epic",
  "knead": { /* KneadState */ },
  "epicTasks": [ /* EpicTask[] */ ],
  "subtaskDrafts": { "<taskId>": { /* Draft */ }, ... }
}
```

One atomic row, mirrors the single-mode upsert flow, no migration. Rejected alternatives: **B** (one row per subtask + parent row) needs relations/migration/partial-write recovery — over-engineered; **C** (persist only `knead`+`epicTasks` metadata) drops subtask bodies so opening elsewhere loses the work.

## Components & changes

### 1. Schema — `lib/drafts/schemas.ts` (the real gap)

`DraftUpsertSchema` is a plain `z.object`, which **strips unknown keys**. Today `knead`/`epicTasks` are dropped on save (inert "forward-compat"). Add:

- `knead` — validated loosely (`z.unknown().optional()` or a permissive KneadState shape) to avoid coupling the draft schema to evolving knead internals.
- `epicTasks` — `z.array(...).optional()` (EpicTask shape, IDs + titles + relations + review/upload fields).
- `subtaskDrafts` — `z.record(z.string(), <draft-shape>).optional()`.

Single-task save is unaffected (these stay `undefined`).

### 2. Save — `saveAsDraft` in `StandaloneApp.tsx`

When `epicMode`, assemble the epic payload before the fetch via a pure helper (see §6):
`knead`, `epicTasks`, and `subtaskDrafts` built from `loadDraft(epicTaskNamespace(t.id))` for each task. Send `{ draft: { ...mainEditorDraft, mode:'epic', knead, epicTasks, subtaskDrafts } }`. Single mode sends its current single `Draft` with `mode:'single'`. POST/PATCH upsert + `draftId` tracking unchanged.

### 3. Open / hydrate — `?draft=` on-mount + dashboard "open"

Branch on `payload.mode`:
- **single** — current path unchanged.
- **epic** — write main payload into `NAMESPACE`; `setEpicMode(true)`; `setKnead(payload.knead)`; `setEpicTasks(payload.epicTasks)`; for each `subtaskDrafts[id]` call `saveDraft(epicTaskNamespace(id), draft)` to restore per-task namespaces; rebuild `analyzeChatById` from those; then `setDraftReloadToken(t => t+1)`.

### 4. Dashboard badge + preview — `lib/drafts/store.ts` + `components/drafts/DraftCard.tsx`

`DraftListItem.mode` already flows through. In `store.listDrafts`, derived purely from `payload` (no live UI state available server-side):
- epic `workingTitle` = first non-empty of: first line of `payload.knead?.sourceDescription`, then `payload.epicTasks?.[0]?.title`, then fallback `"Untitled epic"`.
- epic `preview` = `"{n} tasks"` from `payload.epicTasks?.length ?? 0`.

`DraftCard` renders a mode chip (`Single` / `Epic`) and uses the epic preview.

### 5. Finalize-delete for epic

Hook the **UploadSheet close** path in `StandaloneApp.tsx` (the handler that does `setUploadOpen(false)`). On close, if `draftId` is set **and ≥1 task has `uploadedIssueKey`**, fire `DELETE /api/drafts/{id}` (best-effort, same as single mode) and clear `draftId`. A pure cancel with **zero** uploads does **not** delete. (Product decision: delete on batch close regardless of partial failures, because uploaded tasks already persist their `uploadedIssueKey` in Jira.)

### 6. Structural improvement — pure payload helpers

Extract epic payload assemble/apply as pure functions in `lib/drafts/payload.ts`:
- `buildEpicDraftPayload(state)` → the epic payload object.
- `applyEpicDraft(payload)` → the data needed to hydrate state + the per-namespace subtask writes.

Keeps the ~1300-line `StandaloneApp.tsx` thin and makes the logic unit-testable without the component. No unrelated refactoring.

## Testing (TDD, under `tests/` mirroring source, importing via `@/`)

- Schema round-trips `knead` / `epicTasks` / `subtaskDrafts` (and still strips truly-unknown keys).
- `store` epic `workingTitle` / `preview` derivation.
- `buildEpicDraftPayload` / `applyEpicDraft` pure-function round-trip.
- `DraftCard` epic rendering (mode chip + "N tasks").
- Finalize-delete-on-close predicate (pure "should delete?" fn): true when `draftId` set and ≥1 uploaded; false on zero uploads or no `draftId`.
- All existing single-mode tests stay green (453 baseline, 2 skipped).

## Verification (after build)

- `npm run typecheck` (clear `.next/types .next/dev/types` first if stale validators appear), `npm run lint`, full `npm test`.
- Live Supabase smoke via `node --env-file=.env.local` script against the `drafts` table: create an epic-mode payload, read it back, confirm `mode='epic'` + bundled `epicTasks`/`subtaskDrafts` round-trip, then delete. (Throwaway script, deleted after.)

## Out of scope

- No DB migration (jsonb + `mode` already cover it).
- No multi-row draft model.
- No change to the Jira export/upload mechanics themselves — only the draft-delete hook on sheet close.
- No e2e of the type→save flow (React 19 controlled-input Playwright quirk); e2e stays SSR-structure smoke.
