# Draft Tasks with Dashboard — Implementation Plan (AI-33)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user save a partially-filled task as a draft, see their drafts on a dedicated dashboard, reopen one to keep editing, and finalize it through the normal publish flow — with drafts stored in Supabase and strictly scoped to the owner.

**Architecture:** A new Supabase `drafts` table (one row per draft, owned by an Atlassian `accountId`) is accessed only server-side from new `/api/drafts` Route Handlers, gated by the existing `requireSession()` and scoped by the session's `accountId`. `localStorage` stays the editor's live scratch buffer; an explicit "Save as draft" button persists to Supabase. A new `/drafts` page lists the user's drafts; opening one writes its payload into the editor's namespace via `?draft=<id>`; Finalize deletes the draft on success.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Zod 4, `@supabase/supabase-js`, Tailwind (custom HIG tokens), Vitest + Testing Library, Playwright.

**Scope:** Single-task drafts only (epic mode is unmerged on `AI-36`; the schema is forward-compatible — see the spec `docs/superpowers/specs/2026-06-03-draft-tasks-dashboard-design.md`).

---

## File Structure

**Create:**
- `supabase/migrations/0001_create_drafts.sql` — the `drafts` table + index + RLS.
- `lib/supabase/server.ts` — server-only service-role client factory.
- `lib/drafts/payload.ts` — `DraftListItem` type + `deriveWorkingTitle` / `stripHtml` / `derivePreview` helpers.
- `lib/drafts/schemas.ts` — loose `DraftUpsertSchema` + `DraftUpsertBodySchema`.
- `lib/drafts/store.ts` — data-access layer (`listDrafts`/`getDraft`/`createDraft`/`updateDraft`/`deleteDraft`), all scoped by `accountId`.
- `lib/drafts/client.ts` — `upsertRequest` / `deleteDraftRequest` pure helpers (in-place vs new).
- `lib/drafts/time.ts` — `formatRelativeTime`.
- `app/api/drafts/route.ts` — `GET` (list) + `POST` (create).
- `app/api/drafts/[id]/route.ts` — `GET` + `PATCH` + `DELETE`.
- `app/drafts/page.tsx` — server page, auth-gated, renders the dashboard.
- `components/drafts/DraftsView.tsx` — pure presentational state machine (loading/empty/error/loaded).
- `components/drafts/DraftCard.tsx` — one draft row.
- `components/drafts/DraftsDashboard.tsx` — client: fetch + delete + render `DraftsView`.
- Tests alongside: `lib/drafts/*.test.ts`, `app/api/drafts/*.test.ts`, `components/drafts/*.test.tsx`, `components/Editor.savedraft.test.tsx`, `e2e/drafts.spec.ts`.

**Modify:**
- `components/Editor.tsx` — add `onSaveDraft` + `reloadToken` props and a "Save as draft" button.
- `components/StandaloneApp.tsx` — `draftId` state, save handler + confirmation banner, open-on-mount (`?draft=`), finalize-delete hook, Drafts nav link.
- `.env.local` (+ documentation) — `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- `package.json` — add `@supabase/supabase-js`.

---

## Task 0: Provision Supabase, add the table, wire the client

**Files:**
- Create: `supabase/migrations/0001_create_drafts.sql`
- Create: `lib/supabase/server.ts`
- Modify: `package.json` (dependency), `.env.local`

> **Note for the implementer:** Provisioning uses the Supabase MCP connector available in this environment. It may require the user to authenticate the connector first — if connector calls fail with an auth error, pause and ask the user to authenticate, then continue. If the connector is unavailable, create the table by pasting the migration SQL into the Supabase SQL editor manually.

- [ ] **Step 1: Install the Supabase client**

Run: `npm install @supabase/supabase-js`
Expected: `package.json` gains `@supabase/supabase-js` under dependencies; lockfile updates.

- [ ] **Step 2: Write the migration SQL**

Create `supabase/migrations/0001_create_drafts.sql`:

```sql
create extension if not exists pgcrypto;

create table if not exists public.drafts (
  id               uuid primary key default gen_random_uuid(),
  owner_account_id text not null,
  mode             text not null default 'single',
  working_title    text,
  payload          jsonb not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists drafts_owner_updated_idx
  on public.drafts (owner_account_id, updated_at desc);

-- Enable RLS with NO policies. The server uses the service-role key (which
-- bypasses RLS); all access is mediated by the authenticated API layer. With
-- no policies, a leaked anon/auth key can read nothing.
alter table public.drafts enable row level security;
```

- [ ] **Step 3: Apply the migration via the Supabase connector**

Using the Supabase connector: create/select the project, then apply the SQL from Step 2 (e.g. the connector's "apply migration" / "execute SQL" action). Confirm the `drafts` table and `drafts_owner_updated_idx` index exist.
Expected: table `public.drafts` exists with the columns above; RLS enabled.

- [ ] **Step 4: Record credentials in `.env.local`**

Add to `.env.local` (create if missing — it is gitignored):

```
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

Get these from the connector (project URL + service-role key). The service-role key has no `NEXT_PUBLIC_` prefix, so Next.js keeps it server-only.

- [ ] **Step 5: Write the server-only client factory**

Create `lib/supabase/server.ts`:

```ts
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

// Service-role client for server-side data access. Never import this from a
// client component — the "server-only" guard turns that into a build error.
export function getServiceClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).",
    );
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
```

- [ ] **Step 6: Verify typecheck passes**

Run: `npm run typecheck`
Expected: no errors (the new file compiles; `server-only` resolves via Next.js).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json supabase/migrations/0001_create_drafts.sql lib/supabase/server.ts
git commit -m "feat(AI-33): add Supabase drafts table + server client"
```

---

## Task 1: Draft payload helpers + loose upsert schema

**Files:**
- Create: `lib/drafts/payload.ts`
- Create: `lib/drafts/schemas.ts`
- Test: `lib/drafts/payload.test.ts`, `lib/drafts/schemas.test.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `lib/drafts/payload.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveWorkingTitle, stripHtml, derivePreview } from "./payload";

describe("deriveWorkingTitle", () => {
  it("uses a trimmed title when present", () => {
    expect(deriveWorkingTitle({ title: "  Export users  " })).toBe("Export users");
  });
  it("falls back to 'Untitled draft' when empty/missing", () => {
    expect(deriveWorkingTitle({ title: "   " })).toBe("Untitled draft");
    expect(deriveWorkingTitle({})).toBe("Untitled draft");
  });
});

describe("stripHtml", () => {
  it("removes tags and collapses whitespace", () => {
    expect(stripHtml("<p>Hello <b>world</b></p>\n<p>again</p>")).toBe("Hello world again");
  });
});

describe("derivePreview", () => {
  it("strips HTML and truncates to 140 chars with an ellipsis", () => {
    const long = "<p>" + "a".repeat(300) + "</p>";
    const preview = derivePreview({ description: long });
    expect(preview.length).toBeLessThanOrEqual(140);
    expect(preview.endsWith("…")).toBe(true);
  });
  it("returns short text unchanged", () => {
    expect(derivePreview({ description: "<p>short</p>" })).toBe("short");
    expect(derivePreview({})).toBe("");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/drafts/payload.test.ts`
Expected: FAIL — `Cannot find module './payload'`.

- [ ] **Step 3: Implement the helpers**

Create `lib/drafts/payload.ts`:

```ts
import type { Draft } from "@/lib/draft/autosave";

// What the dashboard list endpoint returns per row.
export type DraftListItem = {
  id: string;
  workingTitle: string;
  mode: string;
  updatedAt: string; // ISO timestamp
  preview: string;
};

// What a single draft fetch returns (enough to hydrate the editor).
export type DraftDetail = {
  id: string;
  mode: string;
  workingTitle: string;
  updatedAt: string;
  payload: Partial<Draft>;
};

export function deriveWorkingTitle(payload: Partial<Draft>): string {
  const t = (payload.title ?? "").trim();
  return t || "Untitled draft";
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PREVIEW_MAX = 140;

export function derivePreview(payload: Partial<Draft>): string {
  const text = stripHtml(payload.description ?? "");
  if (text.length <= PREVIEW_MAX) return text;
  return text.slice(0, PREVIEW_MAX - 1).trimEnd() + "…";
}
```

- [ ] **Step 4: Run the helper tests to verify they pass**

Run: `npx vitest run lib/drafts/payload.test.ts`
Expected: PASS (8 assertions).

- [ ] **Step 5: Write the failing schema tests**

Create `lib/drafts/schemas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { DraftUpsertSchema } from "./schemas";

describe("DraftUpsertSchema", () => {
  it("accepts a completely empty draft (no publish-time requirements)", () => {
    const r = DraftUpsertSchema.safeParse({});
    expect(r.success).toBe(true);
  });
  it("accepts partial input exactly as entered", () => {
    const r = DraftUpsertSchema.safeParse({ title: "", description: "half a thought" });
    expect(r.success).toBe(true);
  });
  it("rejects a title longer than 200 chars", () => {
    const r = DraftUpsertSchema.safeParse({ title: "x".repeat(201) });
    expect(r.success).toBe(false);
  });
  it("rejects a non-string title", () => {
    const r = DraftUpsertSchema.safeParse({ title: 123 });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 6: Run the schema tests to verify they fail**

Run: `npx vitest run lib/drafts/schemas.test.ts`
Expected: FAIL — `Cannot find module './schemas'`.

- [ ] **Step 7: Implement the loose schema**

Create `lib/drafts/schemas.ts`:

```ts
import { z } from "zod";

// Loose, save-time schema: every field optional, no min(1). Partial and empty
// input is preserved exactly. Bounds are size guards only, not requirements.
export const DraftUpsertSchema = z.object({
  title: z.string().max(200).optional(),
  description: z.string().max(50_000).optional(),
  acceptanceCriteria: z.array(z.string().max(2_000)).max(100).optional(),
  constraints: z.string().max(20_000).optional(),
  taskType: z.string().max(64).optional(),
  diagrams: z.unknown().optional(),
  chatHistory: z.unknown().optional(),
  // Forward-compat: accepted but unused until epic drafts land.
  mode: z.enum(["single", "epic"]).optional(),
});

export const DraftUpsertBodySchema = z.object({ draft: DraftUpsertSchema });

export type DraftUpsertInput = z.infer<typeof DraftUpsertSchema>;
```

- [ ] **Step 8: Run the schema tests to verify they pass**

Run: `npx vitest run lib/drafts/schemas.test.ts`
Expected: PASS (4 assertions).

- [ ] **Step 9: Commit**

```bash
git add lib/drafts/payload.ts lib/drafts/payload.test.ts lib/drafts/schemas.ts lib/drafts/schemas.test.ts
git commit -m "feat(AI-33): draft payload helpers + loose upsert schema"
```

---

## Task 2: Data-access store (ownership-scoped)

**Files:**
- Create: `lib/drafts/store.ts`
- Test: `lib/drafts/store.test.ts`

The store is the security boundary: **every function takes `accountId` and filters by `owner_account_id`.** Tests assert that invariant against a fake Supabase client.

- [ ] **Step 1: Write the failing store tests**

Create `lib/drafts/store.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// A chainable fake of the Supabase query builder. Records every .eq() filter
// and resolves to a preset { data, error }. Thenable so `await builder` works
// for the list query; maybeSingle/single return the same preset.
function makeFake(result: { data: unknown; error: unknown }) {
  const eqCalls: Array<[string, unknown]> = [];
  let inserted: unknown = null;
  let updated: unknown = null;
  const builder: any = {
    eqCalls,
    get inserted() { return inserted; },
    get updated() { return updated; },
    select() { return builder; },
    order() { return builder; },
    insert(v: unknown) { inserted = v; return builder; },
    update(v: unknown) { updated = v; return builder; },
    delete() { return builder; },
    eq(col: string, val: unknown) { eqCalls.push([col, val]); return builder; },
    maybeSingle() { return Promise.resolve(result); },
    single() { return Promise.resolve(result); },
    then(res: (v: unknown) => unknown) { return Promise.resolve(result).then(res); },
  };
  return builder;
}

const fromMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getServiceClient: () => ({ from: fromMock }),
}));

import {
  listDrafts,
  getDraft,
  createDraft,
  updateDraft,
  deleteDraft,
} from "./store";

beforeEach(() => fromMock.mockReset());

describe("listDrafts", () => {
  it("filters by owner and maps rows to list items", async () => {
    const fake = makeFake({
      data: [
        { id: "d1", working_title: "T", mode: "single", updated_at: "2026-06-03T00:00:00Z", payload: { description: "<p>hi</p>" } },
      ],
      error: null,
    });
    fromMock.mockReturnValue(fake);
    const items = await listDrafts("acct-A");
    expect(fake.eqCalls).toContainEqual(["owner_account_id", "acct-A"]);
    expect(items[0]).toMatchObject({ id: "d1", workingTitle: "T", preview: "hi" });
  });
});

describe("getDraft", () => {
  it("filters by BOTH owner and id; returns null when not found", async () => {
    const fake = makeFake({ data: null, error: null });
    fromMock.mockReturnValue(fake);
    const draft = await getDraft("acct-A", "d-missing");
    expect(fake.eqCalls).toContainEqual(["owner_account_id", "acct-A"]);
    expect(fake.eqCalls).toContainEqual(["id", "d-missing"]);
    expect(draft).toBeNull();
  });
});

describe("createDraft", () => {
  it("inserts owner from arg, defaults mode to single, derives working_title", async () => {
    const fake = makeFake({ data: { id: "new-id" }, error: null });
    fromMock.mockReturnValue(fake);
    const id = await createDraft("acct-A", { title: "  Hello  " });
    expect(id).toBe("new-id");
    expect(fake.inserted).toMatchObject({
      owner_account_id: "acct-A",
      mode: "single",
      working_title: "Hello",
    });
  });
});

describe("updateDraft", () => {
  it("filters by owner and id and returns false when no row matched", async () => {
    const fake = makeFake({ data: null, error: null });
    fromMock.mockReturnValue(fake);
    const ok = await updateDraft("acct-A", "d1", { title: "x" });
    expect(fake.eqCalls).toContainEqual(["owner_account_id", "acct-A"]);
    expect(fake.eqCalls).toContainEqual(["id", "d1"]);
    expect(ok).toBe(false);
  });
});

describe("deleteDraft", () => {
  it("filters by owner and id and returns true when a row matched", async () => {
    const fake = makeFake({ data: { id: "d1" }, error: null });
    fromMock.mockReturnValue(fake);
    const ok = await deleteDraft("acct-A", "d1");
    expect(fake.eqCalls).toContainEqual(["owner_account_id", "acct-A"]);
    expect(fake.eqCalls).toContainEqual(["id", "d1"]);
    expect(ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run the store tests to verify they fail**

Run: `npx vitest run lib/drafts/store.test.ts`
Expected: FAIL — `Cannot find module './store'`.

- [ ] **Step 3: Implement the store**

Create `lib/drafts/store.ts`:

```ts
import type { Draft } from "@/lib/draft/autosave";
import { getServiceClient } from "@/lib/supabase/server";
import {
  deriveWorkingTitle,
  derivePreview,
  type DraftListItem,
  type DraftDetail,
} from "./payload";

const TABLE = "drafts";

export class DraftStoreError extends Error {}

type Row = {
  id: string;
  owner_account_id: string;
  mode: string;
  working_title: string | null;
  payload: Partial<Draft>;
  created_at: string;
  updated_at: string;
};

function fail(error: unknown): never {
  throw new DraftStoreError(
    error instanceof Error ? error.message : String(error),
  );
}

export async function listDrafts(accountId: string): Promise<DraftListItem[]> {
  const { data, error } = await getServiceClient()
    .from(TABLE)
    .select("id, working_title, mode, updated_at, payload")
    .eq("owner_account_id", accountId)
    .order("updated_at", { ascending: false });
  if (error) fail(error);
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    workingTitle: r.working_title || "Untitled draft",
    mode: r.mode,
    updatedAt: r.updated_at,
    preview: derivePreview(r.payload ?? {}),
  }));
}

export async function getDraft(
  accountId: string,
  id: string,
): Promise<DraftDetail | null> {
  const { data, error } = await getServiceClient()
    .from(TABLE)
    .select("id, mode, working_title, updated_at, payload")
    .eq("owner_account_id", accountId)
    .eq("id", id)
    .maybeSingle();
  if (error) fail(error);
  if (!data) return null;
  const r = data as Row;
  return {
    id: r.id,
    mode: r.mode,
    workingTitle: r.working_title || "Untitled draft",
    updatedAt: r.updated_at,
    payload: r.payload ?? {},
  };
}

export async function createDraft(
  accountId: string,
  payload: Partial<Draft>,
): Promise<string> {
  const { data, error } = await getServiceClient()
    .from(TABLE)
    .insert({
      owner_account_id: accountId,
      mode: (payload as { mode?: string }).mode ?? "single",
      working_title: deriveWorkingTitle(payload),
      payload,
    })
    .select("id")
    .single();
  if (error) fail(error);
  return (data as { id: string }).id;
}

export async function updateDraft(
  accountId: string,
  id: string,
  payload: Partial<Draft>,
): Promise<boolean> {
  const { data, error } = await getServiceClient()
    .from(TABLE)
    .update({
      mode: (payload as { mode?: string }).mode ?? "single",
      working_title: deriveWorkingTitle(payload),
      payload,
      updated_at: new Date().toISOString(),
    })
    .eq("owner_account_id", accountId)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) fail(error);
  return Boolean(data);
}

export async function deleteDraft(
  accountId: string,
  id: string,
): Promise<boolean> {
  const { data, error } = await getServiceClient()
    .from(TABLE)
    .delete()
    .eq("owner_account_id", accountId)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) fail(error);
  return Boolean(data);
}
```

- [ ] **Step 4: Run the store tests to verify they pass**

Run: `npx vitest run lib/drafts/store.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/drafts/store.ts lib/drafts/store.test.ts
git commit -m "feat(AI-33): ownership-scoped Supabase drafts store"
```

---

## Task 3: API routes (collection + item) with auth + ownership

**Files:**
- Create: `app/api/drafts/route.ts`
- Create: `app/api/drafts/[id]/route.ts`
- Test: `app/api/drafts/route.test.ts`, `app/api/drafts/id-route.test.ts`

All routes call `requireSession()` first (→ 401 when unauthenticated). The owner is always `session.accountId`; a client-supplied owner is ignored. Single-draft routes return **404** when the store returns null/false (unknown id *or* not owned — indistinguishable, so deep links don't leak existence).

- [ ] **Step 1: Write the failing collection-route tests**

Create `app/api/drafts/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/auth/requireSession", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/drafts/store", () => ({
  listDrafts: vi.fn(),
  createDraft: vi.fn(),
}));

import { requireSession } from "@/lib/auth/requireSession";
import { listDrafts, createDraft } from "@/lib/drafts/store";
import { GET, POST } from "./route";

const SESSION = { accountId: "acct-A", email: "a@b.co" } as never;

function jsonReq(body: unknown) {
  return new Request("http://localhost/api/drafts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/drafts", () => {
  it("401s when unauthenticated", async () => {
    (requireSession as ReturnType<typeof vi.fn>).mockResolvedValue(
      NextResponse.json({ error: "not_authenticated" }, { status: 401 }),
    );
    const res = await GET();
    expect(res.status).toBe(401);
  });
  it("returns the current user's drafts", async () => {
    (requireSession as ReturnType<typeof vi.fn>).mockResolvedValue(SESSION);
    (listDrafts as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "d1" }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(listDrafts).toHaveBeenCalledWith("acct-A");
    expect(await res.json()).toEqual({ drafts: [{ id: "d1" }] });
  });
});

describe("POST /api/drafts", () => {
  it("creates a draft scoped to the session account", async () => {
    (requireSession as ReturnType<typeof vi.fn>).mockResolvedValue(SESSION);
    (createDraft as ReturnType<typeof vi.fn>).mockResolvedValue("new-id");
    const res = await POST(jsonReq({ draft: { title: "Hi" } }));
    expect(res.status).toBe(201);
    expect(createDraft).toHaveBeenCalledWith("acct-A", { title: "Hi" });
    expect(await res.json()).toEqual({ id: "new-id" });
  });
  it("400s on an invalid payload", async () => {
    (requireSession as ReturnType<typeof vi.fn>).mockResolvedValue(SESSION);
    const res = await POST(jsonReq({ draft: { title: 123 } }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run app/api/drafts/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implement the collection route**

Create `app/api/drafts/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/requireSession";
import { DraftUpsertBodySchema } from "@/lib/drafts/schemas";
import { listDrafts, createDraft, DraftStoreError } from "@/lib/drafts/store";

export const runtime = "nodejs";

export async function GET() {
  const sessionOrRes = await requireSession();
  if (sessionOrRes instanceof NextResponse) return sessionOrRes;
  try {
    const drafts = await listDrafts(sessionOrRes.accountId);
    return NextResponse.json({ drafts });
  } catch (err) {
    console.error("[api/drafts] list failed:", err);
    return NextResponse.json(
      { error: "We couldn't load your drafts." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const sessionOrRes = await requireSession();
  if (sessionOrRes instanceof NextResponse) return sessionOrRes;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = DraftUpsertBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "We couldn't save your draft." }, { status: 400 });
  }
  try {
    const id = await createDraft(sessionOrRes.accountId, parsed.data.draft);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    console.error("[api/drafts] create failed:", err);
    const msg = err instanceof DraftStoreError ? err.message : String(err);
    void msg;
    return NextResponse.json(
      { error: "We couldn't save your draft. Please try again." },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 4: Run to verify collection-route tests pass**

Run: `npx vitest run app/api/drafts/route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing item-route tests**

Create `app/api/drafts/id-route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/auth/requireSession", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/drafts/store", () => ({
  getDraft: vi.fn(),
  updateDraft: vi.fn(),
  deleteDraft: vi.fn(),
}));

import { requireSession } from "@/lib/auth/requireSession";
import { getDraft, updateDraft, deleteDraft } from "@/lib/drafts/store";
import { GET, PATCH, DELETE } from "./[id]/route";

const SESSION = { accountId: "acct-A", email: "a@b.co" } as never;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/drafts/[id]", () => {
  it("404s when the draft is missing or not owned", async () => {
    (requireSession as ReturnType<typeof vi.fn>).mockResolvedValue(SESSION);
    (getDraft as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/drafts/x"), ctx("x"));
    expect(res.status).toBe(404);
    expect(getDraft).toHaveBeenCalledWith("acct-A", "x");
  });
  it("returns the draft when owned", async () => {
    (requireSession as ReturnType<typeof vi.fn>).mockResolvedValue(SESSION);
    (getDraft as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "d1", payload: {} });
    const res = await GET(new Request("http://localhost/api/drafts/d1"), ctx("d1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ draft: { id: "d1", payload: {} } });
  });
});

describe("PATCH /api/drafts/[id]", () => {
  it("404s when update matches no owned row", async () => {
    (requireSession as ReturnType<typeof vi.fn>).mockResolvedValue(SESSION);
    (updateDraft as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const req = new Request("http://localhost/api/drafts/d1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draft: { title: "x" } }),
    });
    const res = await PATCH(req, ctx("d1"));
    expect(res.status).toBe(404);
    expect(updateDraft).toHaveBeenCalledWith("acct-A", "d1", { title: "x" });
  });
});

describe("DELETE /api/drafts/[id]", () => {
  it("204s when an owned row is deleted", async () => {
    (requireSession as ReturnType<typeof vi.fn>).mockResolvedValue(SESSION);
    (deleteDraft as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const res = await DELETE(new Request("http://localhost/api/drafts/d1"), ctx("d1"));
    expect(res.status).toBe(204);
    expect(deleteDraft).toHaveBeenCalledWith("acct-A", "d1");
  });
  it("404s when no owned row matched", async () => {
    (requireSession as ReturnType<typeof vi.fn>).mockResolvedValue(SESSION);
    (deleteDraft as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const res = await DELETE(new Request("http://localhost/api/drafts/x"), ctx("x"));
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `npx vitest run app/api/drafts/id-route.test.ts`
Expected: FAIL — `Cannot find module './[id]/route'`.

- [ ] **Step 7: Implement the item route**

Create `app/api/drafts/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/requireSession";
import { DraftUpsertBodySchema } from "@/lib/drafts/schemas";
import { getDraft, updateDraft, deleteDraft } from "@/lib/drafts/store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const sessionOrRes = await requireSession();
  if (sessionOrRes instanceof NextResponse) return sessionOrRes;
  const { id } = await params;
  try {
    const draft = await getDraft(sessionOrRes.accountId, id);
    if (!draft) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ draft });
  } catch (err) {
    console.error("[api/drafts/:id] get failed:", err);
    return NextResponse.json({ error: "We couldn't open that draft." }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const sessionOrRes = await requireSession();
  if (sessionOrRes instanceof NextResponse) return sessionOrRes;
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = DraftUpsertBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "We couldn't save your draft." }, { status: 400 });
  }
  try {
    const ok = await updateDraft(sessionOrRes.accountId, id, parsed.data.draft);
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ id });
  } catch (err) {
    console.error("[api/drafts/:id] update failed:", err);
    return NextResponse.json(
      { error: "We couldn't update your draft. Please try again." },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const sessionOrRes = await requireSession();
  if (sessionOrRes instanceof NextResponse) return sessionOrRes;
  const { id } = await params;
  try {
    const ok = await deleteDraft(sessionOrRes.accountId, id);
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[api/drafts/:id] delete failed:", err);
    return NextResponse.json(
      { error: "We couldn't delete your draft. Please try again." },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 8: Run to verify item-route tests pass**

Run: `npx vitest run app/api/drafts/id-route.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 9: Commit**

```bash
git add app/api/drafts/route.ts app/api/drafts/route.test.ts app/api/drafts/[id]/route.ts app/api/drafts/id-route.test.ts
git commit -m "feat(AI-33): /api/drafts routes with auth + ownership scoping"
```

---

## Task 4: "Save as draft" button in the editor

**Files:**
- Modify: `components/Editor.tsx`
- Test: `components/Editor.savedraft.test.tsx`

Add two optional props to `Editor`: `onSaveDraft` (called with the current draft) and `reloadToken` (bump to force re-hydration from `localStorage` when a draft is opened). Render a secondary "Save as draft" button next to Finalize.

- [ ] **Step 1: Write the failing component test**

Create `components/Editor.savedraft.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "./Editor";

describe("Editor — Save as draft", () => {
  it("renders the button and calls onSaveDraft with the current draft", async () => {
    const onSaveDraft = vi.fn();
    render(<Editor namespace="test-ns" onFinalize={() => {}} onSaveDraft={onSaveDraft} />);

    const title = screen.getByPlaceholderText("e.g. Export users as CSV");
    await userEvent.type(title, "My draft");

    await userEvent.click(screen.getByRole("button", { name: /save as draft/i }));

    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(onSaveDraft.mock.calls[0][0]).toMatchObject({ title: "My draft" });
  });

  it("does not render the button when onSaveDraft is absent", () => {
    render(<Editor namespace="test-ns2" onFinalize={() => {}} />);
    expect(screen.queryByRole("button", { name: /save as draft/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run components/Editor.savedraft.test.tsx`
Expected: FAIL — no "Save as draft" button found.

- [ ] **Step 3: Add the props to `Editor`**

In `components/Editor.tsx`, change the `Props` type (currently lines 30-35):

```tsx
type Props = {
  namespace: string;
  onFinalize: (draft: Draft) => void;
  disabled?: boolean;
  onHelp?: () => void;
  // Save-as-draft: when provided, renders the control and is called with the
  // current draft. reloadToken forces a re-hydration from localStorage (used
  // when a saved draft is opened into this namespace).
  onSaveDraft?: (draft: Draft) => void;
  reloadToken?: number;
};
```

Update the function signature (currently line 40):

```tsx
export function Editor({ namespace, onFinalize, disabled = false, onHelp, onSaveDraft, reloadToken }: Props) {
```

- [ ] **Step 4: Make the load effect depend on `reloadToken`**

In `components/Editor.tsx`, change the hydration effect (currently lines 51-55) to re-run when `reloadToken` changes:

```tsx
  useEffect(() => {
    const loaded = loadDraft(namespace);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(loaded);
  }, [namespace, reloadToken]);
```

- [ ] **Step 5: Render the "Save as draft" button**

In `components/Editor.tsx`, in the footer (currently lines 246-255), add the button before Finalize:

```tsx
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-rule">
        {onHelp && (
          <Button type="button" variant="ghost" onClick={onHelp}>
            Help
          </Button>
        )}
        {onSaveDraft && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => onSaveDraft(draft)}
            disabled={disabled}
          >
            Save as draft
          </Button>
        )}
        <Button type="submit" size="lg" disabled={disabled || !draft.title.trim()}>
          Finalize task
        </Button>
      </div>
```

- [ ] **Step 6: Run to verify the test passes**

Run: `npx vitest run components/Editor.savedraft.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add components/Editor.tsx components/Editor.savedraft.test.tsx
git commit -m "feat(AI-33): add Save-as-draft control to the editor"
```

---

## Task 5: Client request helpers (in-place vs new, delete)

**Files:**
- Create: `lib/drafts/client.ts`
- Test: `lib/drafts/client.test.ts`

These pure helpers encode the "save updates in place, not duplicates" rule so it is unit-tested independently of the React wiring.

- [ ] **Step 1: Write the failing test**

Create `lib/drafts/client.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { upsertRequest, deleteDraftRequest } from "./client";

describe("upsertRequest", () => {
  it("POSTs to the collection when there is no draftId (new draft)", () => {
    expect(upsertRequest(null)).toEqual({ url: "/api/drafts", method: "POST" });
  });
  it("PATCHes the same draft in place when a draftId exists", () => {
    expect(upsertRequest("abc")).toEqual({ url: "/api/drafts/abc", method: "PATCH" });
  });
});

describe("deleteDraftRequest", () => {
  it("targets the item endpoint", () => {
    expect(deleteDraftRequest("abc")).toEqual({ url: "/api/drafts/abc", method: "DELETE" });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/drafts/client.test.ts`
Expected: FAIL — `Cannot find module './client'`.

- [ ] **Step 3: Implement the helpers**

Create `lib/drafts/client.ts`:

```ts
export function upsertRequest(draftId: string | null): {
  url: string;
  method: "POST" | "PATCH";
} {
  return draftId
    ? { url: `/api/drafts/${draftId}`, method: "PATCH" }
    : { url: "/api/drafts", method: "POST" };
}

export function deleteDraftRequest(draftId: string): {
  url: string;
  method: "DELETE";
} {
  return { url: `/api/drafts/${draftId}`, method: "DELETE" };
}
```

- [ ] **Step 4: Run to verify the test passes**

Run: `npx vitest run lib/drafts/client.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/drafts/client.ts lib/drafts/client.test.ts
git commit -m "feat(AI-33): client request helpers for draft upsert/delete"
```

---

## Task 6: Wire save / open / finalize-delete into StandaloneApp

**Files:**
- Modify: `components/StandaloneApp.tsx`

This task is integration glue across the points identified in the spec. No new unit tests (logic is covered by Tasks 3/5 and the e2e in Task 9); verify with `typecheck` + manual run.

- [ ] **Step 1: Add imports and state**

In `components/StandaloneApp.tsx`, add to the existing imports near the top:

```tsx
import { saveDraft, EMPTY_DRAFT } from "@/lib/draft/autosave";
import { upsertRequest, deleteDraftRequest } from "@/lib/drafts/client";
```

> Note: `Draft`/`loadDraft`/`saveDraft` may already be imported from `@/lib/draft/autosave` — merge the named imports rather than duplicating the statement. Add only what's missing (`saveDraft`, `EMPTY_DRAFT`).

Add state alongside the existing `useState` block (after line 68, `jiraBanner`):

```tsx
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftReloadToken, setDraftReloadToken] = useState(0);
  const [draftSavedNote, setDraftSavedNote] = useState<string | null>(null);
```

- [ ] **Step 2: Add the save-as-draft handler**

In `components/StandaloneApp.tsx`, add this function next to `submit` (after line 322):

```tsx
  async function saveAsDraft(draft: Draft) {
    setDraftSavedNote(null);
    const { url, method } = upsertRequest(draftId);
    try {
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ draft }),
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
```

- [ ] **Step 3: Open a saved draft on mount via `?draft=<id>`**

In the mount `useEffect` IIFE that already parses query params (around lines 125-144, where `params.get("jira")` is read), add draft handling. Insert after the `const params = new URLSearchParams(window.location.search);` line:

```tsx
      const draftParam = params.get("draft");
      if (draftParam) {
        try {
          const res = await fetch(`/api/drafts/${draftParam}`, { credentials: "same-origin" });
          if (res.status === 401) {
            window.location.href = `/signin?return=${encodeURIComponent(`/?draft=${draftParam}`)}`;
            return;
          }
          if (res.ok) {
            const json = await res.json();
            const payload = (json?.draft?.payload ?? {}) as Partial<Draft>;
            saveDraft(NAMESPACE, { ...EMPTY_DRAFT, ...payload });
            if (!cancelled) {
              setDraftId(draftParam);
              setDraftReloadToken((t) => t + 1);
            }
          } else if (!cancelled) {
            setSubmitErr("We couldn't open that draft. It may have been deleted.");
          }
        } catch {
          if (!cancelled) setSubmitErr("We couldn't open that draft. Please try again.");
        }
        // Strip ?draft= from the URL so a refresh doesn't re-open/clobber edits.
        const url = new URL(window.location.href);
        url.searchParams.delete("draft");
        window.history.replaceState({}, "", url.pathname + url.search);
      }
```

> The existing block already declares `cancelled` and clears `?jira=`; reuse them. Keep the existing `jira` handling intact — this is additive.

- [ ] **Step 4: Pass the new props to `<Editor>`**

In `components/StandaloneApp.tsx`, update the `<Editor>` render (lines 415-420):

```tsx
              <Editor
                namespace={NAMESPACE}
                onFinalize={submit}
                onSaveDraft={saveAsDraft}
                reloadToken={draftReloadToken}
                disabled={mode.kind === "running"}
                onHelp={() => setHelpOpen("editor")}
              />
```

- [ ] **Step 5: Show the "Draft saved" confirmation banner**

In `components/StandaloneApp.tsx`, inside the idle/running branch, just below the existing `submitErr` alert (after line 413, before the `<div className="flex-1 min-h-0">` wrapping `<Editor>`), add:

```tsx
            {draftSavedNote && (
              <div className="mb-3 rounded-md bg-accent-tint border border-accent/30 px-4 py-2.5 shrink-0" role="status">
                <p className="text-hig-footnote text-accent">{draftSavedNote}</p>
              </div>
            )}
```

- [ ] **Step 6: Delete the draft on finalize success**

In `components/StandaloneApp.tsx`, replace the `RunSheet` `onFinalized` callback (lines 480-482) so it deletes the backing draft when one is open:

```tsx
          onFinalized={(p) => {
            setMode({ kind: "done", payload: p, lastDraft: mode.lastDraft });
            if (draftId) {
              const { url, method } = deleteDraftRequest(draftId);
              void fetch(url, { method, credentials: "same-origin" }).catch(() => {
                /* best-effort cleanup; the draft simply remains listed */
              });
              setDraftId(null);
            }
          }}
```

- [ ] **Step 7: Clear the saved-note when the user edits again / resets**

In `components/StandaloneApp.tsx`, find the `reset` function (it sets mode back to idle) and add `setDraftSavedNote(null);` and `setDraftId(null);` inside it so starting over clears draft association. (If `reset` clears the editor draft, the dashboard association should drop too.)

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add components/StandaloneApp.tsx
git commit -m "feat(AI-33): wire save/open/finalize-delete for drafts into StandaloneApp"
```

---

## Task 7: Drafts dashboard view (states) + card

**Files:**
- Create: `lib/drafts/time.ts`
- Create: `components/drafts/DraftCard.tsx`
- Create: `components/drafts/DraftsView.tsx`
- Test: `lib/drafts/time.test.ts`, `components/drafts/DraftsView.test.tsx`, `components/drafts/DraftCard.test.tsx`

`DraftsView` is a **pure** component driven by a `state` prop, so all four states are unit-testable without network.

- [ ] **Step 1: Write the failing relative-time test**

Create `lib/drafts/time.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatRelativeTime } from "./time";

const NOW = new Date("2026-06-03T12:00:00Z").getTime();

describe("formatRelativeTime", () => {
  it("formats recent times", () => {
    expect(formatRelativeTime("2026-06-03T11:59:30Z", NOW)).toBe("just now");
    expect(formatRelativeTime("2026-06-03T11:30:00Z", NOW)).toBe("30m ago");
    expect(formatRelativeTime("2026-06-03T09:00:00Z", NOW)).toBe("3h ago");
    expect(formatRelativeTime("2026-06-01T12:00:00Z", NOW)).toBe("2d ago");
  });
  it("returns empty string for invalid input", () => {
    expect(formatRelativeTime("not-a-date", NOW)).toBe("");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/drafts/time.test.ts`
Expected: FAIL — `Cannot find module './time'`.

- [ ] **Step 3: Implement `formatRelativeTime`**

Create `lib/drafts/time.ts`:

```ts
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const sec = Math.round((now - then) / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.round(day / 7);
  if (wk < 5) return `${wk}w ago`;
  return new Date(iso).toLocaleDateString();
}
```

- [ ] **Step 4: Run to verify the test passes**

Run: `npx vitest run lib/drafts/time.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing card test**

Create `components/drafts/DraftCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DraftCard } from "./DraftCard";

const ITEM = {
  id: "d1",
  workingTitle: "Export users",
  mode: "single",
  updatedAt: "2026-06-03T11:30:00Z",
  preview: "We need a CSV export",
};

describe("DraftCard", () => {
  it("renders title, preview, and an Open link to the editor", () => {
    render(<DraftCard item={ITEM} now={new Date("2026-06-03T12:00:00Z").getTime()} onDelete={() => {}} />);
    expect(screen.getByText("Export users")).toBeInTheDocument();
    expect(screen.getByText("We need a CSV export")).toBeInTheDocument();
    expect(screen.getByText("30m ago")).toBeInTheDocument();
    const open = screen.getByRole("link", { name: /open/i });
    expect(open).toHaveAttribute("href", "/?draft=d1");
  });
  it("calls onDelete with the id", async () => {
    const onDelete = vi.fn();
    render(<DraftCard item={ITEM} now={Date.now()} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith("d1");
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `npx vitest run components/drafts/DraftCard.test.tsx`
Expected: FAIL — `Cannot find module './DraftCard'`.

- [ ] **Step 7: Implement `DraftCard`**

Create `components/drafts/DraftCard.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/Button";
import { formatRelativeTime } from "@/lib/drafts/time";
import type { DraftListItem } from "@/lib/drafts/payload";

type Props = {
  item: DraftListItem;
  now?: number;
  onDelete: (id: string) => void;
};

export function DraftCard({ item, now = Date.now(), onDelete }: Props) {
  return (
    <div className="hig-card p-4 flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <h3 className="text-hig-headline flex-1 min-w-0 truncate">{item.workingTitle}</h3>
        <span className="text-hig-footnote text-ink-secondary shrink-0">
          {formatRelativeTime(item.updatedAt, now)}
        </span>
      </div>
      {item.preview && (
        <p className="text-hig-footnote text-ink-secondary line-clamp-2">{item.preview}</p>
      )}
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button type="button" variant="danger" size="sm" onClick={() => onDelete(item.id)}>
          Delete
        </Button>
        <a
          href={`/?draft=${item.id}`}
          className="inline-flex items-center justify-center gap-1.5 rounded-md font-medium h-7 px-2.5 text-hig-footnote bg-accent text-white hover:bg-accent-hover"
        >
          Open
        </a>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Run to verify the card test passes**

Run: `npx vitest run components/drafts/DraftCard.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 9: Write the failing view-state test**

Create `components/drafts/DraftsView.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DraftsView } from "./DraftsView";

describe("DraftsView", () => {
  it("shows a loading state", () => {
    render(<DraftsView state={{ kind: "loading" }} onDelete={() => {}} onRetry={() => {}} />);
    expect(screen.getByTestId("drafts-loading")).toBeInTheDocument();
  });
  it("shows an empty state with a CTA to the creator", () => {
    render(<DraftsView state={{ kind: "empty" }} onDelete={() => {}} onRetry={() => {}} />);
    expect(screen.getByText(/no drafts yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create a task/i })).toHaveAttribute("href", "/");
  });
  it("shows an error state with a Retry button", async () => {
    const onRetry = vi.fn();
    render(
      <DraftsView state={{ kind: "error", message: "We couldn't load your drafts." }} onDelete={() => {}} onRetry={onRetry} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't load your drafts.");
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalled();
  });
  it("renders cards when loaded", () => {
    render(
      <DraftsView
        state={{ kind: "loaded", items: [{ id: "d1", workingTitle: "X", mode: "single", updatedAt: "2026-06-03T12:00:00Z", preview: "p" }] }}
        onDelete={() => {}}
        onRetry={() => {}}
      />,
    );
    expect(screen.getByText("X")).toBeInTheDocument();
  });
});
```

- [ ] **Step 10: Run to verify failure**

Run: `npx vitest run components/drafts/DraftsView.test.tsx`
Expected: FAIL — `Cannot find module './DraftsView'`.

- [ ] **Step 11: Implement `DraftsView`**

Create `components/drafts/DraftsView.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/Button";
import { DraftCard } from "./DraftCard";
import type { DraftListItem } from "@/lib/drafts/payload";

export type DraftsState =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; items: DraftListItem[] };

type Props = {
  state: DraftsState;
  onDelete: (id: string) => void;
  onRetry: () => void;
};

export function DraftsView({ state, onDelete, onRetry }: Props) {
  if (state.kind === "loading") {
    return (
      <div data-testid="drafts-loading" className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="hig-card p-4 h-24 animate-pulse bg-surface-muted" />
        ))}
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="flex flex-col items-start gap-3">
        <div className="rounded-md bg-danger/5 border border-danger/30 px-4 py-2.5 w-full" role="alert">
          <p className="text-hig-footnote text-danger">{state.message}</p>
        </div>
        <Button type="button" variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }
  if (state.kind === "empty") {
    return (
      <div className="hig-card p-8 flex flex-col items-center gap-3 text-center">
        <h2 className="text-hig-title3">No drafts yet</h2>
        <p className="text-hig-footnote text-ink-secondary">
          Drafts you save will show up here so you can pick them back up anytime.
        </p>
        <a
          href="/"
          className="inline-flex items-center justify-center gap-1.5 rounded-md font-medium h-9 px-3.5 text-hig-subhead bg-accent text-white hover:bg-accent-hover"
        >
          Create a task
        </a>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {state.items.map((item) => (
        <DraftCard key={item.id} item={item} onDelete={onDelete} />
      ))}
    </div>
  );
}
```

- [ ] **Step 12: Run to verify the view test passes**

Run: `npx vitest run components/drafts/DraftsView.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 13: Commit**

```bash
git add lib/drafts/time.ts lib/drafts/time.test.ts components/drafts/DraftCard.tsx components/drafts/DraftCard.test.tsx components/drafts/DraftsView.tsx components/drafts/DraftsView.test.tsx
git commit -m "feat(AI-33): drafts dashboard view (loading/empty/error/loaded) + card"
```

---

## Task 8: Dashboard page + data fetching + nav links

**Files:**
- Create: `components/drafts/DraftsDashboard.tsx`
- Create: `app/drafts/page.tsx`
- Modify: `components/StandaloneApp.tsx` (Drafts nav link)

- [ ] **Step 1: Implement the data-fetching container**

Create `components/drafts/DraftsDashboard.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { DraftsView, type DraftsState } from "./DraftsView";
import { deleteDraftRequest } from "@/lib/drafts/client";

export function DraftsDashboard() {
  const [state, setState] = useState<DraftsState>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/drafts", { credentials: "same-origin" });
      if (res.status === 401) {
        window.location.href = `/signin?return=${encodeURIComponent("/drafts")}`;
        return;
      }
      if (!res.ok) {
        setState({ kind: "error", message: "We couldn't load your drafts." });
        return;
      }
      const json = await res.json();
      const items = Array.isArray(json?.drafts) ? json.drafts : [];
      setState(items.length ? { kind: "loaded", items } : { kind: "empty" });
    } catch {
      setState({ kind: "error", message: "We couldn't load your drafts. Please check your connection." });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onDelete = useCallback(
    async (id: string) => {
      if (!window.confirm("Delete this draft? This can't be undone.")) return;
      const { url, method } = deleteDraftRequest(id);
      try {
        const res = await fetch(url, { method, credentials: "same-origin" });
        if (!res.ok && res.status !== 404) {
          setState({ kind: "error", message: "We couldn't delete that draft. Please try again." });
          return;
        }
        await load();
      } catch {
        setState({ kind: "error", message: "We couldn't delete that draft. Please try again." });
      }
    },
    [load],
  );

  return (
    <div className="max-w-3xl w-full mx-auto px-6 py-8 flex flex-col gap-5">
      <header className="flex items-center gap-4">
        <div className="flex flex-col">
          <h1 className="text-hig-title2 leading-tight">Your drafts</h1>
          <p className="text-hig-footnote text-ink-secondary mt-0.5">
            Pick up where you left off, or start something new.
          </p>
        </div>
        <span className="flex-1" />
        <a
          href="/"
          className="inline-flex items-center justify-center gap-1.5 rounded-md font-medium h-9 px-3.5 text-hig-subhead bg-surface-muted text-ink border border-rule hover:bg-surface-inset"
        >
          Back to creator
        </a>
      </header>
      <DraftsView state={state} onDelete={onDelete} onRetry={load} />
    </div>
  );
}
```

- [ ] **Step 2: Create the auth-gated page**

Create `app/drafts/page.tsx` (mirrors `app/page.tsx`):

```tsx
import { requireSessionOrRedirect } from "@/lib/auth/requireSession";
import { DraftsDashboard } from "@/components/drafts/DraftsDashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DraftsPage() {
  await requireSessionOrRedirect("/drafts");
  return (
    <main className="min-h-screen bg-surface-subtle">
      <DraftsDashboard />
    </main>
  );
}
```

- [ ] **Step 3: Add the "Drafts" nav link in the app header**

In `components/StandaloneApp.tsx`, in the header (lines 377-392), add a link before `<ThemeToggle />` (line 385):

```tsx
          <span className="flex-1" />
          <a
            href="/drafts"
            className="inline-flex items-center justify-center gap-1.5 rounded-md font-medium h-9 px-3.5 text-hig-subhead bg-surface-muted text-ink border border-rule hover:bg-surface-inset"
          >
            Drafts
          </a>
          <ThemeToggle />
          <JiraChip session={jiraSession} onSessionChange={setJiraSession} />
```

- [ ] **Step 4: Typecheck + run the full unit suite**

Run: `npm run typecheck && npm run test`
Expected: typecheck clean; all Vitest tests pass (no regressions).

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev`, sign in, then:
1. Fill a title + description, click **Save as draft** → confirmation banner appears.
2. Visit **/drafts** (via the header link) → the draft is listed with title, relative time, preview.
3. Click **Open** → editor is pre-populated; edit the title, **Save as draft** again → revisit /drafts and confirm it **updated in place** (still one row).
4. **Finalize** the opened draft → after success, revisit /drafts and confirm it's **gone**.
5. Delete a draft from the dashboard → row disappears; reload confirms.
6. Sign out (or clear the session cookie) and hit **/drafts** → redirected to **/signin** with a return path.

Expected: all six behave as described.

- [ ] **Step 6: Commit**

```bash
git add app/drafts/page.tsx components/drafts/DraftsDashboard.tsx components/StandaloneApp.tsx
git commit -m "feat(AI-33): drafts dashboard page, data fetching, and nav link"
```

---

## Task 9: End-to-end happy path (Playwright)

**Files:**
- Create: `e2e/drafts.spec.ts`

> **Prerequisites:** a running dev server, valid `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`, and a test session. The repo already has a test session installer at `app/api/test/install-session/route.ts` — read it first to learn how to seed an authenticated session in e2e (follow the pattern used by existing specs under `e2e/`). This spec covers save → list → open → update-in-place → delete. It does **not** exercise the AI finalize pipeline (that needs Anthropic credentials and is covered by the unit-tested `onFinalized` delete hook + the manual smoke test in Task 8).

- [ ] **Step 1: Inspect the existing e2e session pattern**

Run: `npx playwright test --list` and read `app/api/test/install-session/route.ts` plus one existing spec in `e2e/`.
Expected: you understand how a spec installs a session and how `baseURL` is configured in `playwright.config.ts`.

- [ ] **Step 2: Write the e2e spec**

Create `e2e/drafts.spec.ts` (adapt the session-install call to match the existing helper's contract discovered in Step 1):

```ts
import { test, expect } from "@playwright/test";

// Adjust this helper to match app/api/test/install-session/route.ts (method,
// body, and what it expects). The goal: the browser context ends up with a
// valid session cookie before we touch /drafts.
async function installSession(request: import("@playwright/test").APIRequestContext) {
  const res = await request.post("/api/test/install-session", {
    data: { accountId: "e2e-acct", email: "e2e@example.com" },
  });
  expect(res.ok()).toBeTruthy();
}

test("save a draft, see it on the dashboard, reopen, update in place, delete", async ({ page, request }) => {
  await installSession(request);

  // 1. Save a draft from the creator.
  await page.goto("/");
  await page.getByPlaceholder("e.g. Export users as CSV").fill("E2E draft title");
  await page.getByRole("button", { name: /save as draft/i }).click();
  await expect(page.getByRole("status")).toContainText(/draft saved/i);

  // 2. It appears on the dashboard.
  await page.goto("/drafts");
  await expect(page.getByText("E2E draft title")).toBeVisible();

  // 3. Open it; the editor is pre-populated.
  await page.getByRole("link", { name: /open/i }).first().click();
  await expect(page.getByPlaceholder("e.g. Export users as CSV")).toHaveValue("E2E draft title");

  // 4. Update in place.
  await page.getByPlaceholder("e.g. Export users as CSV").fill("E2E draft title v2");
  await page.getByRole("button", { name: /save as draft/i }).click();
  await expect(page.getByRole("status")).toContainText(/draft saved/i);

  // Still exactly one row, now with the updated title.
  await page.goto("/drafts");
  await expect(page.getByText("E2E draft title v2")).toBeVisible();
  await expect(page.getByText("E2E draft title", { exact: true })).toHaveCount(0);

  // 5. Delete it.
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /delete/i }).first().click();
  await expect(page.getByText(/no drafts yet/i)).toBeVisible();
});

test("unauthenticated users are redirected away from /drafts", async ({ page }) => {
  await page.goto("/drafts");
  await expect(page).toHaveURL(/\/signin/);
});
```

- [ ] **Step 3: Run the e2e spec**

Run: `npx playwright test e2e/drafts.spec.ts`
Expected: both tests pass against the dev server + test Supabase.

> If the session-install contract differs, fix `installSession` to match the real route; do not weaken the assertions.

- [ ] **Step 4: Commit**

```bash
git add e2e/drafts.spec.ts
git commit -m "test(AI-33): e2e for draft save/list/open/update/delete + auth gate"
```

---

## Task 10: Full verification + wrap-up

- [ ] **Step 1: Run the whole quality gate**

Run: `npm run lint && npm run typecheck && npm run test`
Expected: lint clean, types clean, all unit tests pass.

- [ ] **Step 2: Confirm the spec is fully covered**

Re-read `docs/superpowers/specs/2026-06-03-draft-tasks-dashboard-design.md` and confirm each requirement maps to a task:
- Save draft without publish validation → Tasks 1 (`DraftUpsertSchema`), 4 (button), 6 (handler).
- Confirmation + safe navigation → Task 6 (Step 5 banner).
- Dashboard with metadata + empty/loading/error → Task 7.
- Open in place (no duplication) → Tasks 5 (`upsertRequest`), 6.
- Finalize removes from list → Task 6 (Step 6).
- Auth gating + 404 on cross-user/deep-link → Tasks 3, 8 (page gate).
- Non-technical errors → Tasks 3, 6, 7 (messages).

Expected: no gaps.

- [ ] **Step 3: Final review (optional)**

Consider `/code-review` on the diff before opening a PR.

---

## Notes / Risks

- **Epic drafts are out of scope** (epic mode is unmerged on `AI-36`). The schema is forward-compatible (`mode` column + `jsonb` payload), so adding epic later needs no migration — only editor hydration of epic state and a mode badge/preview.
- **Supabase connectivity** is a runtime dependency. If `SUPABASE_URL`/`SERVICE_ROLE_KEY` are absent, `getServiceClient()` throws and the API routes return a 500 with a non-technical message. Unit tests mock the client, so they don't need live credentials.
- **`?draft=` is stripped from the URL after open** so a refresh doesn't re-fetch and clobber in-progress edits.
- **Finalize delete is best-effort** — if the DELETE fails, the draft simply remains listed; the user can delete it manually. (Acceptable for v1.)
