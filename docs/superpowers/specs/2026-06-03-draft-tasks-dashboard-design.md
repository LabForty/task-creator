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

Scope for this iteration: **both single-task and epic drafts.**

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Persistence backend | Supabase (Postgres), accessed server-side via `supabase-js` service role | Durable, listable, cross-device; the app's identity is Atlassian OAuth (not Firebase Auth), and all storage access already flows through authenticated `/api/*` routes, so server-side access + API-layer scoping is the natural fit. |
| Provisioning | Via the Supabase connector available in this environment | Creates project/table and wires credentials. |
| Save model | Explicit **"Save as draft"** → server; `localStorage` stays the live scratch buffer | Matches the ticket's "expose a clear control to mark as draft and save"; predictable, low write-load. |
| Finalize lifecycle | Remove the draft **on finalize success** (required-field validation passes + story generated) | Closest literal match to the ticket; Jira export remains a separate later step. |
| Dashboard location | Dedicated `/drafts` App Router route | Matches existing `/`, `/signin`, `/embed` pattern; linkable, easy to auth-gate. |
| Scope | Single **and** epic drafts | Per user direction. |

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
| `mode` | `text` not null | `'single'` \| `'epic'`. |
| `working_title` | `text` | Derived: `payload.title` (trimmed) → first epic task title → `'Untitled draft'`. Stored for cheap listing. |
| `payload` | `jsonb` not null | The full `Draft` blob (title, description, acceptanceCriteria, constraints, taskType, diagrams, chatHistory, mode, knead, epicTasks). |
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
  query param, fetches `GET /api/drafts/[id]`, hydrates the editor from `payload`, and sets `draftId`.
  For `mode === 'epic'` it reconstructs the epic-mode state (`epicTasks`, `knead`, chat history,
  diagrams) from the payload rather than from the per-subtask `localStorage` namespaces.
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
- **Row content**: working title (or "Untitled draft"), a **mode badge** (single/epic), relative
  "last updated", a short **preview** (description snippet, or "N tasks" for epic), and **Open** +
  **Delete** (with confirm) actions.
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

- **Epic-draft hydration** is the highest-risk piece: the `payload` must faithfully capture and restore
  `StandaloneApp`'s epic state, and hydration must rebuild epic mode from the payload (not the per-subtask
  `localStorage` namespaces). The data model already supports it (one row, whole blob); the work is in the
  hydration path.
- **Serverless/disk note**: drafts deliberately do **not** use the local encrypted-file approach used for
  Jira sessions, because a listable per-user collection needs a real datastore that survives multi-instance
  / serverless deploys — hence Supabase.

## Out of scope (this iteration)

- Sharing drafts between users / collaboration.
- Draft version history / autosave-to-server (explicit save only).
- Changing the Jira export step or the Claude pipeline itself.
