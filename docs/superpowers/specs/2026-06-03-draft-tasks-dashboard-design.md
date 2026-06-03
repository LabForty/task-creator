# Draft tasks with dashboard — Design (AI-33)

**Ticket:** [AI-33 — Support draft tasks with dashboard](https://labforty.atlassian.net/browse/AI-33)
**Date:** 2026-06-03
**Status:** Approved (design)

## Summary

Introduce a first-class **draft** state for tasks in the task creator. A signed-in user can
explicitly save a partially completed task as a draft (without satisfying publish-time
validation), see all of their drafts on a dedicated dashboard, reopen one to keep editing,
and finalize it through the normal publish flow. Drafts are stored server-side in Supabase
(Postgres), scoped to the user's Atlassian `accountId`, and are never visible or reachable
by any other user — including via deep links or direct identifiers.

Scope for this iteration: **single-task drafts only**, built on `main`. Epic mode currently
lives only on the unmerged `AI-36-epic-mode-sp1-kneading` branch (not on `main`), so epic-draft
support is a **deliberate fast-follow** once AI-36 merges. The data model is kept
forward-compatible (a `mode` column defaulting to `'single'` + a `jsonb` payload) so epic drafts
drop in later with no migration.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Persistence backend | Supabase (Postgres), accessed server-side via `supabase-js` service role | Durable, listable, cross-device; the app's identity is Atlassian OAuth (not Firebase Auth), and all storage access already flows through authenticated `/api/*` routes, so server-side access + API-layer scoping is the natural fit. |
| Provisioning | Via the Supabase connector available in this environment | Creates project/table and wires credentials. |
| Save model | Explicit **"Save as draft"** → server; `localStorage` stays the live scratch buffer | Matches the ticket's "expose a clear control to mark as draft and save"; predictable, low write-load. |
| Finalize lifecycle | Remove the draft **on finalize success** (required-field validation passes + story generated) | Closest literal match to the ticket; Jira export remains a separate later step. |
| Dashboard location | Dedicated `/drafts` App Router route | Matches existing `/`, `/signin`, `/embed` pattern; linkable, easy to auth-gate. |
| Scope | **Single-task drafts only** on `main`; epic deferred | Epic mode is unmerged (AI-36 branch only); data model kept forward-compatible so epic drafts add later with no migration. |

## Existing architecture (context)

- **Next.js 16** (App Router) + React 19 + TypeScript; Tailwind with a custom HIG token set; custom in-house UI kit (`components/ui`). No external state manager.
- **Full-stack**: backend is Next.js Route Handlers under `app/api/**`. No database today.
- **Auth**: Atlassian OAuth 2.0 (3LO). Current user identified by `session.accountId`.
  Server gates: `requireSession()` (API → 401) and `requireSessionOrRedirect()` (pages → `/signin`).
  Sessions persisted as an AES-256-GCM encrypted file (`lib/jira/session-store.ts`).
- **Existing "draft"**: a *single* live autosaved blob in `localStorage` per namespace
  (`lib/draft/autosave.ts`, key `task-creator:draft:<namespace>`). No ids, timestamps, or collection.
  `Draft` shape: `title, description, acceptanceCriteria[], constraints, taskType, diagrams?, chatHistory?, mode, knead?, epicTasks?`.
- **Finalize/publish**: `Editor.onFinalize` → `StandaloneApp.submit` → `POST /api/finalize`
  → Claude pipeline (`lib/finalize/index.ts`) → SSE job stream (`finalized` / `gates_failed` / `error`).
  Publish validation lives in `DraftSchema` (Zod, `lib/api/schemas.ts`): `title min(1) max(200)`,
  `description min(1)`, AC/constraints/taskType optional. Jira export is a separate later step
  (`components/JiraExport.tsx` → `/api/jira/export`).
- **List UI to mirror**: `components/epic/EpicTaskCards.tsx` / `EpicTaskCard.tsx` / `EpicEditingView.tsx`.
- **Banner patterns**: errors via `role="alert"` + `bg-danger/...`; status via `role="status"`.

## Data model — Supabase `drafts` table

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK default `gen_random_uuid()` | The only identifier exposed; server-generated. |
| `owner_account_id` | `text` not null | Atlassian `accountId`; always set from the session, never from the client. |
| `mode` | `text` not null default `'single'` | `'single'` for this iteration; the column exists so `'epic'` drops in later with no migration. |
| `working_title` | `text` | Derived: `payload.title` (trimmed) → `'Untitled draft'`. Stored for cheap listing. (Epic title-derivation added with epic support.) |
| `payload` | `jsonb` not null | The full `Draft` blob (title, description, acceptanceCriteria, constraints, taskType, diagrams, chatHistory). The `jsonb` shape absorbs the future epic fields (`mode`, `knead`, `epicTasks`) without a schema change. |
| `created_at` | `timestamptz` not null default `now()` | |
| `updated_at` | `timestamptz` not null default `now()` | Bumped on every save. |

- **Index**: `(owner_account_id, updated_at desc)` for the dashboard query.
- **RLS**: enabled with **no anon/authenticated policies** (defense-in-depth). The server uses
  the service-role key (bypasses RLS); enforcement lives in the API layer. A leaked anon key
  cannot read any draft.
- Delivered as a SQL migration committed to the repo.

## API routes

All under `app/api/drafts`, all call `requireSession()` first (→ 401 if unauthenticated).
The owner is always taken from `session.accountId`; a client-supplied owner is ignored.

| Route | Behaviour |
|---|---|
| `GET /api/drafts` | List the current user's drafts: `{ id, working_title, mode, updated_at, preview }`, newest first. |
| `POST /api/drafts` | Create a draft from a payload (validated by `DraftUpsertSchema`); returns `{ id }`. |
| `GET /api/drafts/[id]` | Fetch one draft. **If not found *or* not owned by the current user → 404** (identical response, so a deep link to another user's draft is indistinguishable from a missing one). |
| `PATCH /api/drafts/[id]` | Update in place (ownership-checked). Used by "Save as draft" on an already-saved draft. |
| `DELETE /api/drafts/[id]` | Delete (ownership-checked). Used by manual delete *and* finalize cleanup. |

### Validation schemas
- **`DraftSchema`** (existing, strict) — unchanged; remains the publish/finalize gate.
- **`DraftUpsertSchema`** (new, loose) — all fields optional/nullable, no `min(1)`, but type- and
  size-bounded (e.g. `title max(200)`, array/string length caps). Governs draft saves so partial
  and empty input is preserved exactly as entered.

### Data-access layer
A typed module (e.g. `lib/drafts/store.ts`) wrapping the Supabase client: `listDrafts(accountId)`,
`getDraft(accountId, id)`, `createDraft(accountId, payload)`, `updateDraft(accountId, id, payload)`,
`deleteDraft(accountId, id)`. Every function takes `accountId` and filters by it — ownership is a
parameter, not an afterthought. Supabase client created from `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
env vars.

## Editor & app changes (`Editor.tsx`, `StandaloneApp.tsx`)

- **"Save as draft" control** beside Finalize. Click → gather the current `Draft` → `POST` (no
  `draftId` yet) or `PATCH /api/drafts/[id]` (existing). Saving an opened draft updates **in place**
  (no duplication). Show a **confirmation state** ("Draft saved") via the existing `role="status"`
  banner; the user can then navigate away safely. The save path uses `DraftUpsertSchema`, so it
  never enforces publish-time required fields.
- **Current draft id**: `StandaloneApp` tracks a `draftId` (null = unsaved/new). It is set when a
  draft is opened and when a brand-new draft is first saved (from the `POST` response).
- **Opening a draft**: dashboard rows link to `/?draft=<id>`. On mount `StandaloneApp` reads the
  query param (following the existing `?jira=` handling in the mount `useEffect`, around
  `StandaloneApp.tsx:125-144`), fetches `GET /api/drafts/[id]`, writes the payload into the
  editor's `localStorage` namespace via `saveDraft(NAMESPACE, …)` so the editor hydrates from it,
  and sets `draftId`.
- **Finalize**: existing flow unchanged. On the existing `finalized` SSE success event, if `draftId`
  is set, call `DELETE /api/drafts/[id]` (the draft is now a finalized task, ready to export to Jira).
  On `gates_failed` / validation failure the user stays on the draft, inline errors show, and the
  draft remains saved.

## Drafts dashboard (`/drafts`)

- `app/drafts/page.tsx` — server component gated by `requireSessionOrRedirect('/drafts')`; renders a
  client `DraftsDashboard` that fetches `GET /api/drafts`.
- **Four states**:
  - *Loading* — skeleton rows.
  - *Empty* — "No drafts yet" with a CTA back to the creator (`/`).
  - *Error* — non-technical banner ("We couldn't load your drafts.") + **Retry**.
  - *Populated* — cards mirroring `EpicTaskCard` style.
- **Row content**: working title (or "Untitled draft"), relative "last updated", a short
  **preview** (description snippet), and **Open** + **Delete** (with confirm) actions. (A mode
  badge is added alongside epic support.)
- **Entry points**: a **"Drafts"** link from the creator → `/drafts`, and a link back to the creator.

## Auth & security

- `/drafts` page and every `/api/drafts/*` route require a session.
- **Ownership** enforced on every single-draft route; cross-user / deep-link access returns **404**
  (not 403) so existence is not leaked.
- **Session expiry** mid-use → API returns 401 → client routes to `/signin` using the existing
  return-path mechanism (`lib/auth/returnPath.ts`) so the user returns to their intended destination.
- The Supabase service-role key lives only in server env and is never shipped to the client.

## Error handling

All failure paths (list / load / save / update / finalize) surface **clear, non-technical** messages
through the existing alert/status banner patterns. Technical detail (Supabase errors, stack traces)
goes to server logs only. Examples: "Couldn't save your draft. Please try again.", "We couldn't open
that draft.", "We couldn't load your drafts."

## Testing

- **Vitest (unit)**: data-access layer (ownership scoping — a query for user A never returns user B's
  rows), `DraftUpsertSchema` vs `DraftSchema` (loose accepts partial/empty; strict still gates),
  working-title derivation, finalize-deletes-draft logic.
- **Route handler tests**: 401 when unauthenticated; 404 on cross-user/unknown id; create→get→patch→delete
  round-trip scoped by account.
- **Playwright (e2e)**: save a draft → it appears on `/drafts` → reopen pre-populated → finalize →
  removed from the dashboard. Plus the empty-state and an error-state render.

## Risks & notes

- **Epic mode is not on `main`.** It lives on the unmerged `AI-36-epic-mode-sp1-kneading` branch, where
  `Draft` is extended with `mode`/`knead`/`epicTasks` and `components/epic/*` exists. This iteration targets
  `main` and the single-task `Draft` only. The `drafts` table (`mode` column + `jsonb` payload) is designed
  so epic drafts add in later **without a migration** — the fast-follow work is editor hydration of epic
  state and a mode badge/preview, not schema change.
- **Serverless/disk note**: drafts deliberately do **not** use the local encrypted-file approach used for
  Jira sessions, because a listable per-user collection needs a real datastore that survives multi-instance
  / serverless deploys — hence Supabase.

## Out of scope (this iteration)

- **Epic drafts** — deferred to a fast-follow once epic mode (AI-36) merges to `main`. The schema is
  forward-compatible so no migration is needed then.
- Sharing drafts between users / collaboration.
- Draft version history / autosave-to-server (explicit save only).
- Changing the Jira export step or the Claude pipeline itself.
