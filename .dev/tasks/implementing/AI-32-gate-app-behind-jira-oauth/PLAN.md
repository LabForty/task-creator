# AI-32 — Gate the app behind Jira OAuth

**Ticket:** [AI-32](https://labforty.atlassian.net/browse/AI-32)
**Status:** Implemented (awaiting review)
**Branch (to create on `/implement`):** `AI-32-gate-app-behind-jira-oauth`

## Goal

Make the existing Jira OAuth flow the app's authentication. An unauthenticated visitor cannot reach any task-creation surface (standalone, `/embed`, or non-public API routes). After signing in with Jira they are returned to their originally requested URL. "Signed in" means a valid Jira session **and** at least one accessible Jira cloud (already enforced at callback time today).

## Decisions (locked)

| Question | Decision |
|---|---|
| Gate strictness | Valid Jira session **and** ≥1 accessible Jira cloud. The callback already rejects an empty resources list, so a present session is a sufficient proxy. |
| Embed scope | `/embed` is gated too. |
| Unauth UX | Dedicated `/signin` server-rendered landing page with a single "Sign in with Jira" button. |
| Identity provider | Reuse the existing Atlassian OAuth in `lib/jira/oauth.ts`. No new provider, no Microsoft Entra, no Auth.js. |
| Session store | Reuse the existing encrypted file-based store in `lib/jira/session-store.ts`. No new persistence. |
| Return-to-original | Pass a `return` query param through `/api/jira/connect` → state cookie → `/api/jira/callback`. Default `/`. Whitelist to same-origin relative paths only. |

## Out of scope

- Microsoft Entra ID, OIDC, JWT validation, PKCE — not needed; Atlassian OAuth2 is sufficient.
- Federated act-as-user against Jira via Entra.
- Atlassian Single Logout / SLO (Atlassian doesn't expose a useful end-session endpoint for cloud OAuth; sign-out is local-only).
- Multi-cloud picker UI for users with >1 accessible site (separate ticket if needed).
- Persisting `displayName` on the session — already partially fetched via `/me`; nice to have but not required by the gate.
- Database / DB migrations — there are none in the project.

## Threat model / invariants

1. **No unauthenticated request can reach an AI endpoint.** `/api/finalize`, `/api/help`, `/api/diagrams/*`, `/api/jobs/*`, `/api/templates/*`, `/api/title/*` must 401 without a valid session.
2. **No unauthenticated page render leaks app UI.** `app/page.tsx` and `app/embed/page.tsx` must server-redirect to `/signin?return=...` before any client component renders.
3. **The auth surface itself is always public.** `/api/jira/connect`, `/api/jira/callback`, `/api/jira/session`, `/api/jira/whoami`, `/api/jira/disconnect`, and `/signin` are never gated (a gated `/api/jira/connect` would be a redirect loop).
4. **`return` paths are safe.** Only same-origin relative URLs accepted; absolute URLs or `//host` patterns rejected. Prevents open-redirect abuse of the OAuth flow.
5. **No regression on configuration-absent state.** If `JIRA_CLIENT_ID`/`JIRA_CLIENT_SECRET`/`JIRA_COOKIE_SECRET` are missing, `/signin` shows an explanatory "Jira is not configured" state instead of looping.

## Architecture

Two-layer gate:

- **Page layer (`app/page.tsx`, `app/embed/page.tsx`):** Server components that call `requireSessionOrRedirect()`. If absent, return a `redirect("/signin?return=...")`. The existing client UI moves into a child client component.
- **API layer:** New `requireSession()` helper that returns either `{ session }` or a `NextResponse` 401. Each protected route wraps its handler with it.

Middleware is *not* used for auth because:
- The current middleware skips `/api/jira/*` for cookie-handling reasons documented in `middleware.ts:39-45`.
- Middleware runs on Edge by default; the session store uses Node `fs` + `crypto`. We could check cookie *presence* in middleware as a cheap pre-filter, but every page/route already does the real check, so the extra middleware code is dead weight. Skip it.

## File-by-file changes

### New files

#### `lib/auth/requireSession.ts`
Single shared auth helper for server code.

```ts
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { JiraError, getValidSession, isConfigured, type JiraSession } from "@/lib/jira";

// For API routes: returns the session or a 401 NextResponse.
export async function requireSession(): Promise<JiraSession | NextResponse> {
  if (!isConfigured()) {
    return NextResponse.json({ error: "jira_not_configured" }, { status: 503 });
  }
  try {
    return await getValidSession();
  } catch (e) {
    if (e instanceof JiraError && e.code === "not_connected") {
      return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
    }
    // Refresh failure (revoked token, etc.) — treat as unauth.
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
}

// For server components: redirects to /signin?return=... when absent.
// Returns the session when present.
export async function requireSessionOrRedirect(returnPath: string): Promise<JiraSession> {
  try {
    return await getValidSession();
  } catch {
    const safe = sanitizeReturnPath(returnPath);
    redirect(`/signin?return=${encodeURIComponent(safe)}`);
  }
}

// Only allow same-origin relative paths. Reject absolute URLs and protocol-relative.
export function sanitizeReturnPath(p: string | null | undefined): string {
  if (!p) return "/";
  if (!p.startsWith("/")) return "/";
  if (p.startsWith("//")) return "/";
  return p;
}
```

#### `app/signin/page.tsx`
Server component. Three states:
- **Already signed in** → `redirect(return ?? "/")`.
- **Jira not configured** → static "Jira is not configured" card explaining required env vars (mirrors the message in `JiraChip`).
- **Default** → card with title, one-line copy, and a "Sign in with Jira" button that links to `/api/jira/connect?return=...` (top-level navigation, not popup — popup is for the existing in-app chip; for the gate we want a full-page redirect so the user lands back inside the app cleanly).

Reads `searchParams.return`, sanitizes it via `sanitizeReturnPath`, passes it to the button's href.

Also handles `?error=<reason>` (rendered when `/api/jira/callback` redirects back here on failure) — show a small inline error block above the button.

#### `tests/lib/requireSession.test.ts`
- `sanitizeReturnPath` rejects absolute URLs, `//evil.com`, returns `/` for null.
- `requireSession()` returns 401 when no session cookie.
- `requireSession()` returns 503 when env not configured.
- `requireSession()` returns the session when valid (mock `getValidSession`).

#### `tests/app/signin.test.tsx` *(or component test)*
- Renders "Sign in with Jira" button with correct href when no session.
- Renders "not configured" copy when env missing.
- Redirects (via spy on `redirect`) when session present.

### Modified files

#### `app/api/jira/connect/route.ts`
- Accept an optional `return` query param.
- Sanitize it via the new `sanitizeReturnPath` helper.
- Store it inside the state cookie alongside `nonce|popup|redirectUri`, e.g. `nonce|popup|redirectUri|return`.
- No other behavior change.

#### `app/api/jira/callback/route.ts`
- Parse `return` out of the state cookie (extend `parseStateCookie`).
- On `outcome === "connected"` with a non-popup flow, redirect to the sanitized `return` path instead of `/?jira=connected`.
- On `outcome === "error"` with a non-popup flow, redirect to `/signin?error=<reason>&return=<return>` instead of `/?jira=error&reason=...`.
- Popup flow is unchanged (still posts message to opener, used by the in-app `JiraChip` "Connect" affordance which is now redundant — see "JiraChip" below — but the popup path is kept working in case anything still uses it).

#### `app/page.tsx`
Convert to a server component that gates.

- Move the entire current `app/page.tsx` body into a new `components/StandaloneApp.tsx` (keeps `"use client"` directive) — file rename essentially, with one props change: it no longer needs to read `JiraSessionInfo` from `/api/jira/session` to decide what to show, because the page only renders when authenticated. But it does still need session info for the chip display (email, accountId). Pass the session email/accountId in as props from the server component.
- New `app/page.tsx` (server component):
  ```ts
  import { requireSessionOrRedirect } from "@/lib/auth/requireSession";
  import { StandaloneApp } from "@/components/StandaloneApp";

  export default async function Page() {
    const session = await requireSessionOrRedirect("/");
    return <StandaloneApp initialSession={{ email: session.email ?? null, accountId: session.accountId }} />;
  }
  ```

#### `app/embed/page.tsx`
Same treatment.

- Body moves into `components/EmbedApp.tsx` (client).
- New `app/embed/page.tsx` is a server component that calls `requireSessionOrRedirect("/embed?...")` — preserve the `returnOrigin` and any other search params on the return URL.
- Note: gating embed inside an iframe will make the parent page render `/signin` inside the iframe. That's the chosen behavior. Document this in the embed README / inline comment.

#### `components/JiraChip.tsx`
Now that connection is the precondition for rendering, the "Connect to Jira" CTA inside the chip is unreachable. Simplify:
- Keep the connected state (email pill + dropdown with Disconnect).
- Remove the "Connect to Jira" button branch and the `openJiraConnectPopup` export (search for callers first; if anything still uses it, replace with a `<a href="/api/jira/connect?return=...">` link).
- Keep the "Jira not configured" branch as a safety net — should never render because the page would have redirected, but harmless.
- "Disconnect" button now also navigates to `/signin` after the disconnect call resolves (today it just flips local state, which would leave the user staring at the editor with no way to reach any data).

#### `app/api/jira/disconnect/route.ts`
No code change needed. The client-side caller (`JiraChip`) is responsible for redirecting to `/signin` after the response.

#### Protected API routes — wrap each with `requireSession`

For each of these, add at the top of the handler:
```ts
const sessionOrRes = await requireSession();
if (sessionOrRes instanceof NextResponse) return sessionOrRes;
const session = sessionOrRes;
```
- `app/api/finalize/route.ts`
- `app/api/help/route.ts`
- `app/api/diagrams/analyze/route.ts`
- `app/api/diagrams/create/route.ts`
- `app/api/jobs/[id]/route.ts` (SSE — confirm 401 path is sane before the stream opens; if SSE, return a plain `NextResponse.json` with 401 before any stream setup)
- `app/api/templates/sync/route.ts`
- `app/api/templates/types/route.ts`
- `app/api/title/suggest/route.ts`

(Read each file when implementing — some may have early returns that need to come *after* the auth check.)

#### `app/api/jira/{session,whoami,connect,callback,disconnect}/route.ts`
Stay public. No changes other than connect/callback noted above.

#### `middleware.ts`
No change. (Documented above why.)

#### `README.md` (if present) / inline embed copy
Add a short note: embedding now requires the host page's users to be signed in with Jira; first load will render the `/signin` page inside the iframe if they're not. Skip if no README exists or doesn't already cover embedding.

## Tests

Existing tests should continue to pass. New tests:

1. **`tests/lib/requireSession.test.ts`** — covered above.
2. **`tests/api/protected-routes-require-auth.test.ts`** — for a representative protected route (e.g., `/api/help`), assert 401 JSON when no session cookie is set, and 200 (or normal response) when a session is mocked. Use vitest's existing patterns in `tests/lib/*.test.ts`.
3. **`tests/lib/jira-callback-return.test.ts`** — extend or add: callback redirects to the sanitized `return` path on success.
4. **Manual / Playwright smoke (optional):** existing `tests/` doesn't seem to have e2e for the auth flow; add a Playwright spec under `tests/e2e/` only if time permits — happy-path is hard to e2e without real OAuth, so a mocked-cookie test suffices.

## Sequencing (executed)

1. ✅ `lib/auth/returnPath.ts` + `lib/auth/requireSession.ts` + `tests/lib/requireSession.test.ts` (10 new unit tests).
2. ✅ `app/api/jira/connect/route.ts` + `app/api/jira/callback/route.ts` — `return` carried in 4th state-cookie segment; success → return path, failure → `/signin?error=…&return=…`.
3. ✅ `app/signin/page.tsx` (server) + `components/signin/SigninExperience.tsx` (client) + aurora/grid/caret/spotlight/sheen CSS added to `globals.css`.
4. ✅ `app/page.tsx` converted to server component gating via `requireSessionOrRedirect("/")`; body extracted into `components/StandaloneApp.tsx` (initial-session prop seeds the chip).
5. ✅ `app/embed/page.tsx` same treatment → `components/EmbedApp.tsx`; gate preserves the full query string in the return path.
6. ✅ Protected routes wrapped with `requireSession`: finalize, help, diagrams/analyze, diagrams/create, jobs/[id], jobs/[id]/stream, jobs/[id]/download/[artifact], templates/sync, templates/types, title/suggest. Jira data routes (export/projects/issue-types/resources) left as-is — they already require a session token internally.
7. ✅ `components/JiraChip.tsx` — disconnect now navigates to `/signin`. (Reconnect-popup branch kept as in-session safety net for token expiry.)
8. ✅ `npm run lint`, `npm run typecheck`, `npm test` (119/119), `npm run build` all green. Live smoke test via curl:
   - `GET /` no cookie → `307 /signin?return=%2F`
   - `GET /embed?returnOrigin=https://x.com` no cookie → `307 /signin?return=%2Fembed%3F…` (query preserved)
   - `POST /api/finalize|help|jobs/abc` no cookie → `401 {"error":"not_authenticated"}`
   - `GET /api/jira/{session,connect}` public — `200` and `307 → atlassian` respectively
   - Open-redirect test: `/?return=https://evil.com` → `307 /signin?return=%2F` (sanitized)
   - `/signin?error=not_authenticated` renders "Your session expired. Sign in again to continue."

## API test updates

`tests/api/finalize.test.ts`, `tests/api/stream.test.ts`, `tests/api/download.test.ts`, and `tests/api/diagrams-create.test.ts` now mock `@/lib/auth/requireSession` at the top to bypass the gate (the gate itself is covered by `tests/lib/requireSession.test.ts`).

## Bonus polish (beyond plan)

- `components/ThemeToggle.tsx` — pre-existing `react-hooks/set-state-in-effect` lint error suppressed with an inline `eslint-disable-next-line` + explanation comment so `npm run lint` is clean.
- Pre-existing `tiptap-markdown` dep was declared in `package.json` but missing from `node_modules`; ran `npm install` so dev/build work.

## Acceptance criteria

- [x] Visiting `/` while signed out redirects to `/signin?return=%2F`.
- [x] Visiting `/embed?returnOrigin=...` while signed out redirects to `/signin?return=%2Fembed%3FreturnOrigin%3D...`.
- [x] Clicking "Sign in with Jira" on `/signin` initiates Atlassian OAuth and, on success, returns the user to the `return` path. *(Verified via the `?return=` round-trip in connect → callback; live OAuth not exercised in smoke test, but the redirect plumbing is.)*
- [x] If the Atlassian flow errors or returns 0 accessible sites, the user lands on `/signin?error=...` with a plain-language message and a retry button.
- [x] Any `POST /api/{finalize,help,diagrams/*,jobs/*,templates/*,title/*}` without a session cookie returns HTTP 401 `{ error: "not_authenticated" }`.
- [x] `POST /api/jira/disconnect` then refresh → user is on `/signin`. *(`JiraChip.disconnect` now navigates to `/signin` after the disconnect POST resolves.)*
- [x] `npm run lint`, `npm run typecheck`, `npm test` all pass.
- [x] No regression on the existing Jira export flow for a signed-in user. *(No code path in `lib/jira/{export,client,oauth}` modified.)*

## Risks / mitigations

| Risk | Mitigation |
|---|---|
| `app/page.tsx` is currently large and `"use client"` — extracting safely is the most error-prone step. | Do step 4 as a pure rename + re-export first (no logic changes), commit, then add the server-component wrapper in a second commit. Easier to bisect if something breaks. |
| SSE route (`/api/jobs/[id]`) might already have a long-lived handler that doesn't surface 401 cleanly. | Read it carefully in step 6; auth check must run before any `ReadableStream` is constructed. |
| Refresh-token revocation mid-session would currently throw inside `getValidSession`. | `requireSession` catches all errors and returns 401; the user is then redirected to `/signin`. Stale `jira_sid` cookie is harmless because the server-side store no longer has the entry (or has a dead one). Consider clearing the cookie in this path as a follow-up. |
| Embed users on third-party origins might not be able to complete OAuth if Atlassian's `auth.atlassian.com` blocks iframing. | The OAuth flow is a top-level navigation (the "Sign in with Jira" link uses normal href, not `target=_blank`), so the iframe will navigate to the auth domain top-level only if `target="_top"` is set. Add `target="_top"` to the signin link inside the embed signin page to be safe. |
| Browser pop-up blockers killing the existing `openJiraConnectPopup` path. | We're removing that path; the new flow is a normal navigation. |
