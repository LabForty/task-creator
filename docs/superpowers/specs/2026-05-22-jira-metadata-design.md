# Jira-style metadata fields on the task creator — design

**Ticket:** [AI-35](https://labforty.atlassian.net/browse/AI-35) — *Add Jira-style metadata fields to task creator*
**Date:** 2026-05-22
**Status:** approved, ready for implementation plan

## Goal

Extend the task creator so the operator can capture five Jira metadata fields — **labels**, **linked issues**, **draft attachments**, a **flag with required reason**, and an **epic association** — without leaving the export flow, and have those values ride along into the Jira issue that is created.

## Where the fields live

The fields surface on the existing **Export to Jira** sheet (`components/JiraExport.tsx`), not on the editor draft. Rationale:

- The fields need a Jira context (cloud + project + issue type) to populate their data sources (labels autocomplete, epic list, issue search) and to know which custom-field IDs to write to. That context exists post-Finalize, on the Export screen.
- Keeping them off the editor avoids forcing a Jira connection before a user can write a story, and avoids extending the autosaved `Draft` shape with Jira-coupled fields.
- Lifecycle is naturally bounded: metadata exists while the Export sheet is open, then drops when the sheet unmounts (Cancel or post-success Done). This matches the ticket's "draft-attachment scoped to draft lifecycle" wording without inventing new persistence.

## UI layout

The Export sheet keeps its two-pane shell (form left, preview right). The form pane gains a "Metadata" group that sits below Site / Project / Issue type, gated on those three being set. When metadata is unavailable (no project picked yet), the group shows a one-line muted hint rather than empty controls.

```
Export sheet
┌─ FORM (left)                            ┬─ PREVIEW (right) ────────────┐
│ Site         [select]                   │ Title                         │
│ Project      [filter + list]            │ Markdown preview              │
│ Issue type   [select]                   │ ──────                        │
│ ─── Metadata ──────────────             │ Labels    chip chip chip      │
│ Labels       [chips + input]            │ Links     ABC-12 (blocks)…    │
│ Linked       [typeahead + chips]        │ Attachments  file.png (kb)    │
│ Attachments  [drop zone + list]         │ Flag      ⚑ "reason"          │
│ Flag         [toggle ⚑ Set reason]      │ Epic      EPIC-9              │
│ Epic         [picker + Create new]      │ Mermaid .mmd attachments      │
└─────────────────────────────────────────┴───────────────────────────────┘
```

## Component structure

A new directory `components/jira-metadata/` holds the field components:

| File | Role |
|---|---|
| `JiraMetadata.tsx` | Container. Owns the metadata state, renders the five field components, exposes `(value, onChange)` to `JiraExport`. |
| `LabelsField.tsx` | Multi-select with chips + search + inline "Create '<typed>'" affordance. Uses `useJiraLabels`. |
| `LinkedIssuesField.tsx` | Typeahead (debounce 250ms, min 2 chars), result rows showing `KEY — title`, removable chips with per-chip link-type dropdown. Uses `useIssueSearch` and `useLinkTypes`. |
| `AttachmentsField.tsx` | File picker + drop zone, per-file row with name/size/progress/remove, configurable max-size validation. Files held in memory as `File` objects. |
| `FlagField.tsx` | Toggle + opens `FlagReasonModal`. "View reason" affordance when flagged. |
| `FlagReasonModal.tsx` | Required-reason modal (3–500 chars), focus trap, Esc cancels, Enter confirms. |
| `EpicField.tsx` | Picker (existing epics for the chosen project) + inline "Create new epic" affordance. Uses `useEpics`. |
| `hooks.ts` | `useJiraLabels`, `useIssueSearch`, `useEpics`, `useLinkTypes` — small client-side fetch+cache hooks; each owns loading/empty/error/retry state. |

`JiraExport.tsx` continues to own site / project / issue-type, gains `metadata` state via `JiraMetadata`, and passes both into the submit body.

## State shape

```ts
// lib/jira/metadata.ts (new)
export type JiraLinkedIssue = {
  key: string;          // e.g. "ABC-1234"
  title: string;        // summary at the time of selection
  linkTypeId: string;   // id from /rest/api/3/issueLinkType (more stable than name); default = the id of the "Relates" type
};

export type JiraDraftAttachment = {
  id: string;          // client-generated uuid for keyed React rendering
  file: File;          // held in memory until export submit
  // upload status is local-only UI state; not persisted on the metadata object
};

export type JiraEpicRef =
  | { kind: "existing"; key: string; title: string }
  | { kind: "new"; title: string };  // resolved to a real epic at export time

export type JiraMetadata = {
  labels: string[];
  linkedIssues: JiraLinkedIssue[];
  attachments: JiraDraftAttachment[];
  flagged: boolean;
  flagReason?: string;               // present only when flagged === true
  epic?: JiraEpicRef;
};

export const EMPTY_METADATA: JiraMetadata = {
  labels: [],
  linkedIssues: [],
  attachments: [],
  flagged: false,
};

export const MAX_DRAFT_ATTACHMENT_BYTES = 10 * 1024 * 1024; // override via JIRA_DRAFT_ATTACHMENT_MAX_MB
```

The `Draft` shape in `lib/draft/autosave.ts` is **not** extended. Metadata is export-time only.

### Lifecycle / cross-field semantics

- Metadata is dropped when the Export sheet unmounts.
- Project change: `LabelsField` and `EpicField` clear their selected value (labels picker is filtered per-project; epics are per-project). `LinkedIssuesField`, `AttachmentsField`, and `FlagField` retain their values.
- Attachments are not part of the JSON export body; they upload separately after the issue is created (see "Submit flow").

## Server-side API additions

Four new authenticated routes under `app/api/jira/`, all using the existing `requireSession` + `oauth.ts` machinery. Existing OAuth scopes (`read:jira-work`, `write:jira-work`, `read:jira-user`) are sufficient — no scope changes needed.

| Route | Query | Jira endpoint | Response |
|---|---|---|---|
| `GET /api/jira/labels` | `cloudId`, `q` (≥1), `maxResults?` | `GET /rest/api/3/label?query={q}` | `{ labels: string[] }` |
| `GET /api/jira/issue-search` | `cloudId`, `q` (≥2), `projectKey?`, `maxResults?` | `POST /rest/api/3/search/jql` with `text ~ "..."` or `key = "..."` | `{ issues: [{ key, title }] }` |
| `GET /api/jira/link-types` | `cloudId` | `GET /rest/api/3/issueLinkType` | `{ linkTypes: [{ id, name, inward, outward }] }` |
| `GET /api/jira/epics` | `cloudId`, `projectKey`, `q?`, `maxResults?` | `POST /rest/api/3/search/jql` with `project = ... AND issuetype = Epic AND statusCategory != Done` | `{ epics: [{ key, title }] }` |

Plus a fifth route for attachment uploads:

| Route | Body | Jira endpoint | Response |
|---|---|---|---|
| `POST /api/jira/export-attachments` | multipart: `cloudId`, `issueKey`, `file` | `POST /rest/api/3/issue/{key}/attachments` (via existing `uploadAttachment` helper) | `{ ok: true }` or `{ error: string }` |

New client helpers added to `lib/jira/client.ts`:

```ts
searchLabels(token, cloudId, q, max?): Promise<string[]>
searchIssues(token, cloudId, jql, max?): Promise<Array<{ key, title }>>
listLinkTypes(token, cloudId): Promise<Array<{ id, name, inward, outward }>>
createIssueLink(token, cloudId, body): Promise<void>
addComment(token, cloudId, issueKey, adfBody): Promise<void>
```

## Submit flow

The existing `/api/jira/export` stays JSON; the request body's `metadata` is new and optional. After it returns the issue key, the client uploads each draft attachment via the new `/api/jira/export-attachments` route in parallel (one HTTP call per file, with progress tracked via `XMLHttpRequest.upload.onprogress`).

`lib/jira/export.ts`:

```
1. listCreateFields(cloudId, projectKey, issueTypeId)
   resolve: acField, epicField, flaggedField, labelsAvailable
   (acField is the existing one; epic + flagged are new)

2. If metadata.epic?.kind === "new":
   Resolve Epic issuetype id via listCreatableIssueTypes; if none, abort with a structured error.
   Pre-create the epic with createIssue({ summary: epic.title, project, issuetype: <Epic id>, description: "Created from task creator." })
   Use the returned key as the epic key for step 3.

3. Build fields for the main createIssue call:
   - summary, project, issuetype, description (existing)
   - if labelsAvailable && metadata.labels.length: fields.labels = metadata.labels
   - if epicField && metadata.epic:
       set fields[epicField.id] = epicField.mode === "parent"
         ? { key: epicKey }
         : epicKey
   - if flaggedField && metadata.flagged:
       fields[flaggedField.id] = [{ value: "Impediment" }]
   - acField (existing AC routing) unchanged

4. createIssue(fields) → mainKey

5. Load the link-types list once via listLinkTypes(cloudId) → Map<id, { name, inward, outward }>.
   For each linkedIssue (parallel, errors collected per-link):
   createIssueLink({
     type: { id: linkedIssue.linkTypeId },  // Jira accepts id OR name; id is unambiguous
     inwardIssue:  { key: linkedIssue.key },
     outwardIssue: { key: mainKey },
   })
   (Direction follows the type's semantics — the main issue is the "outward" side, matching how the chip UI labels the relationship.)

6. If metadata.flagged && metadata.flagReason:
   addComment(mainKey, adfFromText("Flagged: " + flagReason))
   Failure is collected, does not abort.

7. Mermaid .mmd uploads (existing, unchanged).

8. Return result including: linkResults, flagCommentResult, epicCreated (if pre-created).
```

After this returns to the client, the client uploads draft attachments via `POST /api/jira/export-attachments` and merges those results into the success-view summary.

### Field resolution helpers (new, in `lib/jira/export.ts`)

```ts
findEpicLinkField(meta): { id: string; mode: "parent" | "epic-link" } | null
  // { id: "parent", mode: "parent" } if `parent` field is in createmeta (team-managed)
  // { id: "customfield_XXXXX", mode: "epic-link" } when a field with schema.custom matching /epic-link$/i exists (company-managed)
  // null otherwise

findFlaggedField(meta): { id: string } | null
  // first field whose name matches /^flag(ged)?$/i and is an array-of-options field

findLabelsField(meta): boolean
  // presence of `labels` system field id
```

### Backward compatibility

`metadata` on the request body is fully optional. Existing callers (and the success-response shape) keep working; new fields on the response (`linkResults`, `flagCommentResult`, `epicCreated`) are additive.

## Validation

In `lib/api/schemas.ts`:

```ts
ExportBodySchema gains:
  metadata: z
    .object({
      labels: z.array(z.string().min(1).max(255)).max(50).optional(),
      linkedIssues: z.array(
        z.object({
          key: z.string().regex(/^[A-Z][A-Z0-9_]+-\d+$/),
          linkTypeId: z.string().min(1),
        }),
      ).max(50).optional(),
      flagged: z.boolean().optional(),
      flagReason: z.string().min(3).max(500).optional(),
      epic: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("existing"), key: z.string() }),
        z.object({ kind: z.literal("new"), title: z.string().min(1).max(255) }),
      ]).optional(),
    })
    .refine(m => !m.flagged || (m.flagReason && m.flagReason.length >= 3), {
      message: "flagReason required when flagged is true",
    })
    .optional(),
```

Client-side rules:

- **Labels** — non-empty after trim; ≤255 chars per label; max 50 selected; case-insensitive duplicate guard within the selection. New-label inline create just adds the typed string to the selection — Jira auto-creates labels at issue-create time, so there is no separate "create" call.
- **Linked issues** — key must match `/^[A-Z][A-Z0-9_]+-\d+$/`; max 50; client-side dedupe on (key, linkTypeId).
- **Attachments** — per-file size ≤ `MAX_DRAFT_ATTACHMENT_BYTES`; no count cap; no mime-type restriction.
- **Flag** — `flagged=true` requires `flagReason` length 3–500 after trim; modal cannot confirm without a valid reason; clearing the flag clears the reason.
- **Epic (new)** — title length 1–255 after trim.

## UX states per field

| Field | Loading | Empty | Error |
|---|---|---|---|
| Labels | spinner row in dropdown after debounced fetch | "No matching labels" + visible "Create '<typed>'" row when input non-empty | "Couldn't load labels. Retry" + button; rest of form usable |
| Linked issues | spinner row in dropdown (after 250ms debounce + 2-char min) | "No issues match" | "Couldn't search issues. Retry"; rest of form usable |
| Epics | "Loading epics…" beneath the picker | "No open epics in this project — create one below" | "Couldn't load epics. Retry"; create-new still works |
| Attachments | per-file progress bar | "Drop files here or click to browse" | per-file inline: "File too large (max 10MB): <name>" — does not affect other files in list |
| Flag | n/a | n/a | n/a |

The filtered result list for Linked issues must render within 500ms of the last keystroke (debounce 250ms + Jira call must return in ~250ms typical; we surface a spinner immediately so perceived latency stays low).

## Error handling principle

The five sub-systems are **independent**. A failure in any one of: epic pre-create (when `kind: "new"` and Epic issuetype missing), link-issues, flag-comment, draft-attachment upload — must NOT abort the export. Each failure surfaces in the success view's "Partial outcomes" section. The only thing that aborts is a failure on the main `createIssue` itself.

Special case: if `metadata.epic?.kind === "new"` is requested but the project has no Epic issuetype, we abort *before* any create call and surface a structured error to the user, who can either pick an existing epic or drop the epic.

## Accessibility

- Every field has a programmatic `<label>` via `htmlFor` (using the existing `TextField`/`TextArea` patterns).
- Dropdowns (Labels, Linked issues, Epics) implement `role="combobox"` with `aria-expanded`, `aria-controls`, `aria-activedescendant`; arrow keys move focus through results; Enter selects; Esc closes.
- Chips have `aria-label="Remove <name>"` on the remove button and are reachable by Tab; Backspace from the input removes the last chip.
- File drop zone is announced as "Press space to choose files, or drop files here", with `role="button"` and `tabIndex={0}`.
- `FlagReasonModal` traps focus inside the dialog; focus moves to the textarea on open; Tab cycles within the modal; Esc and the close button both restore focus to the toggle.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `JIRA_DRAFT_ATTACHMENT_MAX_MB` | `10` | Per-file attachment size cap. Read at request time in `lib/jira/config.ts`; surfaced to the client via the form so client- and server-side caps match. |

No new OAuth scopes.

## Testing plan

**Unit (vitest):**

- `lib/jira/metadata.ts` — pure validators (label dedupe, key regex, reason length).
- `lib/jira/export.ts` — field-resolution helpers (`findEpicLinkField`, `findFlaggedField`, `findLabelsField`) against fixture `listCreateFields` payloads (one team-managed, one company-managed, one with no epic field).
- `lib/api/schemas.ts` — `ExportBodySchema.metadata` valid + invalid cases, including the `flagged → flagReason` refine.
- Each hook (`useJiraLabels`, `useIssueSearch`, `useEpics`, `useLinkTypes`) — debounce, abort-on-rerender, error/retry transitions, with `vi.mocked` fetch.

**Integration (vitest, mocked Jira fetch):**

- `exportToJira` happy path with all five metadata fields populated — assert the call sequence (createIssue → createIssueLink ×N → addComment → .mmd uploads).
- Partial failure cases: link fails / flag comment fails / attachment fails — issue still created, errors surfaced in result.
- Inline-epic path: pre-creates epic, uses returned key on the main issue, surfaces a structured error when project lacks Epic issuetype.

**E2E (Playwright, `TASK_AGENT_MODE=stub`):**

- One smoke spec: open Export sheet after Finalize → fill each new field with stubbed Jira routes → submit → assert success view shows expected chips/items + partial-outcome summary.

**No tests for:** drag-and-drop drop-zone wiring (DOM event quirks), focus-trap internals (covered by manual a11y review).

## Files touched / created

```
new:
  app/api/jira/labels/route.ts
  app/api/jira/issue-search/route.ts
  app/api/jira/link-types/route.ts
  app/api/jira/epics/route.ts
  app/api/jira/export-attachments/route.ts
  components/jira-metadata/JiraMetadata.tsx
  components/jira-metadata/LabelsField.tsx
  components/jira-metadata/LinkedIssuesField.tsx
  components/jira-metadata/AttachmentsField.tsx
  components/jira-metadata/FlagField.tsx
  components/jira-metadata/FlagReasonModal.tsx
  components/jira-metadata/EpicField.tsx
  components/jira-metadata/hooks.ts
  lib/jira/metadata.ts
  lib/jira/upload-client.ts
  tests/lib/jira/metadata.test.ts
  tests/lib/jira/export-metadata.test.ts
  tests/components/jira-metadata/*.test.tsx
  e2e/export-metadata.spec.ts

modified:
  components/JiraExport.tsx          — wires JiraMetadata; adds Metadata preview block
  lib/jira/export.ts                 — orchestration: epic pre-create, links, flag comment
  lib/jira/client.ts                 — new helpers (searchLabels, searchIssues, listLinkTypes, createIssueLink, addComment)
  lib/jira/config.ts                 — JIRA_DRAFT_ATTACHMENT_MAX_MB
  lib/api/schemas.ts                 — ExportBodySchema gains optional metadata
  app/api/jira/export/route.ts       — pass metadata through to exportToJira; return enriched ExportResult shape (additive)
```

## Out of scope

- Per-Jira-site or per-project metadata persistence across sessions.
- Re-using `JiraMetadata` from the editor draft (would require pre-Finalize project selection, which we explicitly rejected).
- Bulk-link affordances (e.g., paste a list of keys).
- Attachment thumbnail previews beyond file name / size.
- Sub-task creation, watchers, components, fix-versions, priority, due date, assignee — none are in the ticket.
