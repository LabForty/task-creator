# AI-34: Jira export ignores post-finalize markdown edits

## Ticket Details
- **Status**: In Progress
- **Priority**: —
- **Assignee**: Erkan Rasim
- **Labels**: —
- **URL**: https://labforty.atlassian.net/browse/AI-34

## Acceptance Criteria
- The exported Jira ticket's description matches the edited markdown preview exactly.
- If the user removes the release-note title and description from the textarea before export, the created issue's description does not contain them.
- All present diagrams are still uploaded as `.mmd` attachments.
- The Acceptance Criteria custom-field routing (when a project has one) keeps working off the *edited* markdown, not the planner's original.

## Analysis

### Where the bug lives

Two parallel "markdown" values exist on the finalized payload (`lib/jobs/types.ts:5-11`):

- `payload.story.markdown` — the planner's original output, set when the job finalizes.
- `payload.markdown` — the rendered preview body (`story.markdown` + optional `## Diagrams` block, see `lib/render/index.ts:29-42`). This is what the textarea in `components/Preview.tsx:110-121` reads from and writes back to via `onMarkdownChange`.

`StandaloneApp.tsx:458-464` wires `onMarkdownChange` to update `mode.payload.markdown` only — it deliberately does **not** touch `story.markdown` (the comment at lines 26–29 even documents this: "user's manual textarea edits go straight into payload.markdown without touching this path").

But the export path on the client never reads `payload.markdown`. In `components/JiraExport.tsx:155-162`:

```ts
body: JSON.stringify({
  cloudId: siteId,
  projectKey,
  issueTypeId,
  payload: { story: payload.story, constraints: undefined },  // ← payload.markdown dropped
  diagrams: ...,
})
```

So the API receives `payload.story` (unchanged since finalize) and the server in `lib/jira/export.ts:98-104` builds the description ADF and runs AC extraction off `story.markdown` — i.e. the pre-edit snapshot. The user's edits are silently discarded, exactly as the ticket reports.

Note the misleading right-pane "Preview" inside `JiraExport.tsx:355` already renders `payload.markdown`, so the form shows the right thing — only the request body is wrong.

### Choice of fix

Two viable options:

- **A. Sync `story.markdown` to the textarea value** (in `onMarkdownChange`). Smallest diff, but it would clobber the planner's structured output and double-include the appended `## Diagrams` block in the data model. The "do not touch this path" comment in `StandaloneApp.tsx` is an explicit warning against this.
- **B. Pass `payload.markdown` through to the server and use it as the description source.** Adds one schema field and a single line in the export pipeline, but keeps the data model clean: `story` stays the planner artifact, `markdown` is the user-editable description.

Going with **B** — it matches the ticket's framing ("export should serialize the current edited markdown shown in the preview") and the existing intent of `payload.markdown`.

### What stays the same

- Diagrams are still uploaded as separate `.mmd` attachments via `body.diagrams` (`lib/jira/export.ts:151-164`). The user can strip the inline `## Diagrams` block from the textarea if they don't want it duplicated in the description; that's now possible because their edits will be honored.
- `story.title` continues to drive the Jira issue summary (it isn't editable in the preview, so no change needed).
- AC custom-field routing (`isAcField` / `extractAcceptanceCriteria`) keeps working — we just feed it the edited markdown.

## Implementation Steps

1. ✅ **Schema** — extended `ExportPayloadSchema` in `lib/jira/schemas.ts` with `markdown: z.string().min(1)`.
2. ✅ **Client** — `components/JiraExport.tsx` now includes `markdown: payload.markdown` in the POST body.
3. ✅ **Server** — `lib/jira/export.ts` now sources the description and AC extraction from `body.payload.markdown`; `story.title` still drives the issue summary.
4. ✅ **Tests** —
   - `tests/lib/jira-schemas.test.ts`: fixtures updated, added cases for missing and empty `payload.markdown`.
   - `tests/lib/jira-export.test.ts` *(new)*: mocks `client`/`oauth`, asserts description ADF derives from `payload.markdown` (not `story.markdown`) and summary stays `story.title`.
5. ✅ **Sanity** — `npm run lint`, `npx tsc --noEmit`, and `npm test` (123 passed) all green.

## Affected Files

- `lib/jira/schemas.ts` — add `markdown` to `ExportPayloadSchema`.
- `components/JiraExport.tsx` — include `markdown: payload.markdown` in the export POST body.
- `lib/jira/export.ts` — switch description source from `story.markdown` to `body.payload.markdown`.
- `tests/lib/jira-schemas.test.ts` — update fixtures, add empty-markdown rejection case.
- `tests/lib/jira-export.test.ts` *(new)* or extension of existing test — assert the edited markdown is what reaches `createIssue`.

## Testing

**Automated**
- `npm test` — schema + export tests pass with the new field.
- New export test: with mocked `createIssue`, edited `payload.markdown` ≠ `story.markdown`, assert the ADF passed to `createIssue` is built from the edited markdown.

**Manual (the ticket's repro)**
1. Run dev server, finalize a task with a release-note title/description block.
2. In the preview textarea, delete the release-note title and description.
3. Create diagrams.
4. Export to Jira; pick project + issue type.
5. Open the created issue and verify:
   - Description has no release-note title/description (matches the textarea).
   - `flow.mmd` / `sequence.mmd` / `interaction.mmd` are attached.
   - If the target project has an AC custom field, AC routed there is also the edited version.

## Risks / Open Questions

- **Schema is now stricter.** Any external caller of `/api/jira/export` that omitted `markdown` would 400. The only in-tree caller is `JiraExport.tsx` and we update it in the same change, so this is internal-only.
- **Inline `## Diagrams` block in the description.** With the fix, whatever the user has in the textarea — including the appended diagrams block from `renderFinalized` — ends up in the description. Since attachments are still uploaded, that's a duplication users will see if they don't manually strip the block. Not in scope for AI-34 (and arguably the desired "WYSIWYG" behavior), but worth noting.
- **Empty edit.** `markdown.min(1)` rejects empty strings. The UI shouldn't allow an empty submit (the Export button isn't gated on textarea content), so consider whether to add a client-side guard. Leaving as a 400 from the server for now; the user would have to fully clear the textarea to trigger it.
