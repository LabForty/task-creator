# Jira-style metadata fields on the task creator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five Jira-style metadata fields (labels, linked issues, draft attachments, flag-with-reason, epic) to the Export-to-Jira sheet and have them ride into the created Jira issue via createIssue / issueLink / attachments / comment.

**Architecture:** UI lives in a new `components/jira-metadata/` sub-tree wired into `JiraExport.tsx`. Five new server routes back the data sources (labels autocomplete, issue search, link types, epics) plus a separate multipart attachment route. The existing `lib/jira/export.ts` orchestrator gains post-create steps (issue links, flag comment, epic pre-create) and additional field resolution (Epic-link field, Flagged field, Labels presence).

**Tech Stack:** Next.js 16 App Router, React 19, Zod v4, vitest + jsdom + @testing-library/react, Playwright e2e, existing OAuth-backed `getValidSession`.

**Spec:** `docs/superpowers/specs/2026-05-22-jira-metadata-design.md`. Read it before starting any task.

---

## File Structure

**New files**

```
lib/jira/metadata.ts                         types, constants, pure validators
lib/jira/upload-client.ts                    browser-side XHR upload helper with progress
app/api/jira/labels/route.ts                 GET — label autocomplete
app/api/jira/issue-search/route.ts           GET — issue typeahead
app/api/jira/link-types/route.ts             GET — link types catalog
app/api/jira/epics/route.ts                  GET — epics in a project
app/api/jira/export-attachments/route.ts     POST — multipart attachment upload
components/jira-metadata/JiraMetadata.tsx    container; owns state, renders fields
components/jira-metadata/LabelsField.tsx     multi-select with chips + inline create
components/jira-metadata/LinkedIssuesField.tsx  typeahead + chips with per-chip link type
components/jira-metadata/AttachmentsField.tsx   drop zone + file list w/ progress
components/jira-metadata/FlagField.tsx       toggle + reason
components/jira-metadata/FlagReasonModal.tsx focus-trapped required-reason modal
components/jira-metadata/EpicField.tsx       picker + inline create-new-epic
components/jira-metadata/hooks.ts            useJiraLabels / useIssueSearch / useEpics / useLinkTypes
tests/lib/jira-metadata.test.ts              metadata validators
tests/lib/jira-export-metadata.test.ts       orchestrator end-to-end (mock client)
tests/lib/jira-client-helpers.test.ts        new client helpers
tests/api/jira-labels.test.ts                etc — one per route
tests/api/jira-issue-search.test.ts
tests/api/jira-link-types.test.ts
tests/api/jira-epics.test.ts
tests/api/jira-export-attachments.test.ts
tests/components/jira-metadata/LabelsField.test.tsx
tests/components/jira-metadata/LinkedIssuesField.test.tsx
tests/components/jira-metadata/AttachmentsField.test.tsx
tests/components/jira-metadata/FlagField.test.tsx
tests/components/jira-metadata/EpicField.test.tsx
tests/components/jira-metadata/JiraMetadata.test.tsx
e2e/export-metadata.spec.ts                  Playwright smoke
```

**Modified files**

```
lib/jira/client.ts        + searchLabels / searchIssues / listLinkTypes / createIssueLink / addComment
lib/jira/export.ts        + field-resolution helpers + post-create steps + epic pre-create
lib/jira/schemas.ts       ExportBodySchema gains optional `metadata` block
lib/jira/index.ts         re-export new helpers and types
lib/jira/config.ts        + readDraftAttachmentMaxBytes()
app/api/jira/export/route.ts   (no change beyond the schema accepting `metadata`; just verify behaviour)
components/JiraExport.tsx wire JiraMetadata, pass to submit body, render preview block, upload attachments after submit
```

---

### Task 1: Metadata types, constants, and pure validators

**Files:**
- Create: `lib/jira/metadata.ts`
- Create: `tests/lib/jira-metadata.test.ts`
- Modify: `lib/jira/index.ts` (add re-exports)
- Modify: `lib/jira/config.ts` (add `readDraftAttachmentMaxBytes`)

- [ ] **Step 1: Write the failing test**

Create `tests/lib/jira-metadata.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  EMPTY_METADATA,
  MAX_DRAFT_ATTACHMENT_BYTES_DEFAULT,
  isValidIssueKey,
  isValidFlagReason,
  normalizeLabel,
  dedupeLabels,
} from "@/lib/jira/metadata";

describe("lib/jira/metadata", () => {
  it("EMPTY_METADATA has empty arrays and flagged=false", () => {
    expect(EMPTY_METADATA).toEqual({
      labels: [],
      linkedIssues: [],
      attachments: [],
      flagged: false,
    });
  });

  it("MAX_DRAFT_ATTACHMENT_BYTES_DEFAULT is 10 MiB", () => {
    expect(MAX_DRAFT_ATTACHMENT_BYTES_DEFAULT).toBe(10 * 1024 * 1024);
  });

  it("isValidIssueKey accepts standard keys and rejects junk", () => {
    expect(isValidIssueKey("ABC-1234")).toBe(true);
    expect(isValidIssueKey("AI-1")).toBe(true);
    expect(isValidIssueKey("A1-1")).toBe(false); // must start with a letter
    expect(isValidIssueKey("abc-1")).toBe(false); // must be uppercase
    expect(isValidIssueKey("ABC-")).toBe(false);
    expect(isValidIssueKey("")).toBe(false);
  });

  it("isValidFlagReason enforces 3–500 chars after trim", () => {
    expect(isValidFlagReason("ok")).toBe(false);
    expect(isValidFlagReason("   ok   ")).toBe(false);
    expect(isValidFlagReason("yes")).toBe(true);
    expect(isValidFlagReason("y".repeat(500))).toBe(true);
    expect(isValidFlagReason("y".repeat(501))).toBe(false);
  });

  it("normalizeLabel trims and lowercases for comparison", () => {
    expect(normalizeLabel("  Backend  ")).toBe("backend");
    expect(normalizeLabel("MIXED-Case")).toBe("mixed-case");
  });

  it("dedupeLabels is case-insensitive and preserves first-seen casing", () => {
    expect(dedupeLabels(["Backend", "backend", "Frontend", "BACKEND"])).toEqual([
      "Backend",
      "Frontend",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- jira-metadata`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `lib/jira/metadata.ts`**

```ts
export type JiraLinkedIssue = {
  key: string;
  title: string;
  linkTypeId: string;
};

export type JiraDraftAttachment = {
  id: string;
  file: File;
};

export type JiraEpicRef =
  | { kind: "existing"; key: string; title: string }
  | { kind: "new"; title: string };

export type JiraMetadata = {
  labels: string[];
  linkedIssues: JiraLinkedIssue[];
  attachments: JiraDraftAttachment[];
  flagged: boolean;
  flagReason?: string;
  epic?: JiraEpicRef;
};

export const EMPTY_METADATA: JiraMetadata = {
  labels: [],
  linkedIssues: [],
  attachments: [],
  flagged: false,
};

export const MAX_DRAFT_ATTACHMENT_BYTES_DEFAULT = 10 * 1024 * 1024;

export const ISSUE_KEY_REGEX = /^[A-Z][A-Z0-9_]+-\d+$/;

export function isValidIssueKey(value: string): boolean {
  return ISSUE_KEY_REGEX.test(value);
}

export function isValidFlagReason(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 3 && trimmed.length <= 500;
}

export function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
}

export function dedupeLabels(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const norm = normalizeLabel(v);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push(v.trim());
  }
  return out;
}
```

- [ ] **Step 4: Add `readDraftAttachmentMaxBytes` to `lib/jira/config.ts`**

Append to `lib/jira/config.ts`:

```ts
import { MAX_DRAFT_ATTACHMENT_BYTES_DEFAULT } from "./metadata";

export function readDraftAttachmentMaxBytes(): number {
  const raw = process.env.JIRA_DRAFT_ATTACHMENT_MAX_MB;
  if (!raw) return MAX_DRAFT_ATTACHMENT_BYTES_DEFAULT;
  const mb = Number.parseInt(raw, 10);
  if (!Number.isFinite(mb) || mb <= 0) return MAX_DRAFT_ATTACHMENT_BYTES_DEFAULT;
  return mb * 1024 * 1024;
}
```

- [ ] **Step 5: Re-export from `lib/jira/index.ts`**

Append to `lib/jira/index.ts`:

```ts
export {
  EMPTY_METADATA,
  MAX_DRAFT_ATTACHMENT_BYTES_DEFAULT,
  ISSUE_KEY_REGEX,
  isValidIssueKey,
  isValidFlagReason,
  normalizeLabel,
  dedupeLabels,
  type JiraLinkedIssue,
  type JiraDraftAttachment,
  type JiraEpicRef,
  type JiraMetadata,
} from "./metadata";
export { readDraftAttachmentMaxBytes } from "./config";
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test -- jira-metadata`
Expected: PASS, 6 tests.

- [ ] **Step 7: Commit**

```bash
git add lib/jira/metadata.ts lib/jira/config.ts lib/jira/index.ts tests/lib/jira-metadata.test.ts
git commit -m "feat(AI-35): add Jira metadata types and pure validators"
```

---

### Task 2: Extend `ExportBodySchema` with the metadata block

**Files:**
- Modify: `lib/jira/schemas.ts`
- Create: `tests/lib/jira-metadata-schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/jira-metadata-schema.test.ts
import { describe, it, expect } from "vitest";
import { ExportBodySchema } from "@/lib/jira/schemas";

const baseBody = {
  cloudId: "cloud-1",
  projectKey: "PROJ",
  issueTypeId: "10001",
  payload: {
    story: { title: "t", markdown: "# t\n\n## Acceptance Criteria\n- a" },
    markdown: "# edited",
  },
};

describe("ExportBodySchema.metadata", () => {
  it("accepts a body with no metadata at all", () => {
    const r = ExportBodySchema.safeParse(baseBody);
    expect(r.success).toBe(true);
  });

  it("accepts a fully populated metadata block", () => {
    const r = ExportBodySchema.safeParse({
      ...baseBody,
      metadata: {
        labels: ["backend", "v2"],
        linkedIssues: [{ key: "ABC-1", linkTypeId: "10000" }],
        flagged: true,
        flagReason: "blocked on auth refactor",
        epic: { kind: "existing", key: "EPIC-9" },
      },
    });
    expect(r.success).toBe(true);
  });

  it("rejects flagged=true without flagReason", () => {
    const r = ExportBodySchema.safeParse({
      ...baseBody,
      metadata: { flagged: true },
    });
    expect(r.success).toBe(false);
  });

  it("rejects a label longer than 255 chars", () => {
    const r = ExportBodySchema.safeParse({
      ...baseBody,
      metadata: { labels: ["x".repeat(256)] },
    });
    expect(r.success).toBe(false);
  });

  it("rejects a malformed linked-issue key", () => {
    const r = ExportBodySchema.safeParse({
      ...baseBody,
      metadata: { linkedIssues: [{ key: "abc-1", linkTypeId: "10000" }] },
    });
    expect(r.success).toBe(false);
  });

  it("rejects epic.kind=new without a title", () => {
    const r = ExportBodySchema.safeParse({
      ...baseBody,
      metadata: { epic: { kind: "new", title: "" } },
    });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- jira-metadata-schema`
Expected: FAIL — `metadata` is not allowed (or accepted) by the schema.

- [ ] **Step 3: Extend `lib/jira/schemas.ts`**

```ts
import { z } from "zod";
import { MermaidFormatSchema } from "@/lib/api/schemas";
import { StorySchema } from "@/lib/pipeline";

export const ExportPayloadSchema = z.object({
  story: StorySchema,
  markdown: z.string().min(1, "markdown is required"),
  constraints: z.string().optional(),
});

const ISSUE_KEY = /^[A-Z][A-Z0-9_]+-\d+$/;

export const MetadataSchema = z
  .object({
    labels: z.array(z.string().trim().min(1).max(255)).max(50).optional(),
    linkedIssues: z
      .array(
        z.object({
          key: z.string().regex(ISSUE_KEY),
          linkTypeId: z.string().min(1),
        }),
      )
      .max(50)
      .optional(),
    flagged: z.boolean().optional(),
    flagReason: z.string().trim().min(3).max(500).optional(),
    epic: z
      .discriminatedUnion("kind", [
        z.object({ kind: z.literal("existing"), key: z.string().regex(ISSUE_KEY) }),
        z.object({ kind: z.literal("new"), title: z.string().trim().min(1).max(255) }),
      ])
      .optional(),
  })
  .refine((m) => !m.flagged || (m.flagReason !== undefined && m.flagReason.trim().length >= 3), {
    message: "flagReason is required when flagged is true",
    path: ["flagReason"],
  });

export const ExportBodySchema = z.object({
  cloudId: z.string().min(1),
  projectKey: z.string().min(1),
  issueTypeId: z.string().min(1),
  payload: ExportPayloadSchema,
  diagrams: z.partialRecord(MermaidFormatSchema, z.string()).optional(),
  metadata: MetadataSchema.optional(),
});

export type ExportBody = z.infer<typeof ExportBodySchema>;
export type ExportPayload = z.infer<typeof ExportPayloadSchema>;
export type ExportMetadata = z.infer<typeof MetadataSchema>;
```

- [ ] **Step 4: Re-export `MetadataSchema`/`ExportMetadata` from `lib/jira/index.ts`**

Add to the existing `export { ... } from "./schemas"` block:

```ts
export {
  ExportBodySchema,
  ExportPayloadSchema,
  MetadataSchema,
  type ExportBody,
  type ExportPayload,
  type ExportMetadata,
} from "./schemas";
```

- [ ] **Step 5: Run tests**

Run: `npm run test -- jira-metadata-schema && npm run typecheck`
Expected: PASS, 6 tests; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add lib/jira/schemas.ts lib/jira/index.ts tests/lib/jira-metadata-schema.test.ts
git commit -m "feat(AI-35): extend ExportBodySchema with metadata block"
```

---

### Task 3: `searchLabels` client helper + `GET /api/jira/labels` route

**Files:**
- Modify: `lib/jira/client.ts` (add `searchLabels`)
- Create: `app/api/jira/labels/route.ts`
- Create: `tests/api/jira-labels.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/api/jira-labels.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/jira", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jira")>("@/lib/jira");
  return {
    ...actual,
    getValidSession: vi.fn(async () => ({ accessToken: "tok" })),
    searchLabels: vi.fn(async (_t: string, _c: string, q: string) =>
      q === "back" ? ["backend", "backend-v2"] : [],
    ),
  };
});

import { GET } from "@/app/api/jira/labels/route";

describe("GET /api/jira/labels", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when cloudId is missing", async () => {
    const res = await GET(new Request("http://x/api/jira/labels?q=back"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when q is missing", async () => {
    const res = await GET(new Request("http://x/api/jira/labels?cloudId=c1"));
    expect(res.status).toBe(400);
  });

  it("returns labels for a valid query", async () => {
    const res = await GET(new Request("http://x/api/jira/labels?cloudId=c1&q=back"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ labels: ["backend", "backend-v2"] });
  });

  it("returns an empty array when nothing matches", async () => {
    const res = await GET(new Request("http://x/api/jira/labels?cloudId=c1&q=zzz"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ labels: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- jira-labels`
Expected: FAIL — module not found.

- [ ] **Step 3: Add `searchLabels` to `lib/jira/client.ts`**

```ts
// Append to lib/jira/client.ts
export async function searchLabels(
  accessToken: string,
  cloudId: string,
  query: string,
  maxResults = 20,
): Promise<string[]> {
  type Resp = { suggestions: Array<{ label: string }> };
  const data = await jiraFetch<Resp>(accessToken, cloudId, "/rest/api/3/label", {
    query: { query, maxResults },
  });
  return data.suggestions?.map((s) => s.label) ?? [];
}
```

Then re-export in `lib/jira/index.ts` in the existing `export { ... } from "./client"` block:

```ts
export {
  jiraFetch,
  listProjects,
  listCreatableIssueTypes,
  createIssue,
  uploadAttachment,
  searchLabels,
  ...
} from "./client";
```

- [ ] **Step 4: Create `app/api/jira/labels/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getValidSession, isJiraError, searchLabels } from "@/lib/jira";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cloudId = url.searchParams.get("cloudId");
  const q = url.searchParams.get("q");
  const maxParam = url.searchParams.get("maxResults");

  if (!cloudId) {
    return NextResponse.json({ error: "cloudId is required" }, { status: 400 });
  }
  if (!q) {
    return NextResponse.json({ error: "q is required" }, { status: 400 });
  }
  const maxResults = Number.parseInt(maxParam ?? "20", 10);
  const max = Number.isFinite(maxResults) && maxResults > 0 ? Math.min(maxResults, 50) : 20;

  try {
    const session = await getValidSession();
    const labels = await searchLabels(session.accessToken, cloudId, q, max);
    return NextResponse.json({ labels });
  } catch (err) {
    if (isJiraError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 5: Run tests**

Run: `npm run test -- jira-labels`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/jira/client.ts lib/jira/index.ts app/api/jira/labels/route.ts tests/api/jira-labels.test.ts
git commit -m "feat(AI-35): add /api/jira/labels autocomplete route"
```

---

### Task 4: `searchIssues` client helper + `GET /api/jira/issue-search` route

**Files:**
- Modify: `lib/jira/client.ts`
- Create: `app/api/jira/issue-search/route.ts`
- Create: `tests/api/jira-issue-search.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/api/jira-issue-search.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/jira", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jira")>("@/lib/jira");
  return {
    ...actual,
    getValidSession: vi.fn(async () => ({ accessToken: "tok" })),
    searchIssues: vi.fn(async () => [
      { key: "ABC-1", title: "Add export" },
      { key: "ABC-2", title: "Fix import" },
    ]),
  };
});

import { GET } from "@/app/api/jira/issue-search/route";
import { searchIssues } from "@/lib/jira";

describe("GET /api/jira/issue-search", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when q is shorter than 2 chars", async () => {
    const res = await GET(new Request("http://x/api/jira/issue-search?cloudId=c1&q=a"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when cloudId is missing", async () => {
    const res = await GET(new Request("http://x/api/jira/issue-search?q=add"));
    expect(res.status).toBe(400);
  });

  it("builds an OR query of text and key when q does not look like a key", async () => {
    await GET(new Request("http://x/api/jira/issue-search?cloudId=c1&q=add"));
    const jqlArg = vi.mocked(searchIssues).mock.calls[0][2];
    expect(jqlArg).toContain('text ~ "add"');
  });

  it("uses `key = ...` when q looks like a Jira key", async () => {
    await GET(new Request("http://x/api/jira/issue-search?cloudId=c1&q=AI-35"));
    const jqlArg = vi.mocked(searchIssues).mock.calls[0][2];
    expect(jqlArg).toContain('key = "AI-35"');
  });

  it("returns the searched issues in the response", async () => {
    const res = await GET(new Request("http://x/api/jira/issue-search?cloudId=c1&q=add"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      issues: [
        { key: "ABC-1", title: "Add export" },
        { key: "ABC-2", title: "Fix import" },
      ],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- jira-issue-search`
Expected: FAIL.

- [ ] **Step 3: Add `searchIssues` to `lib/jira/client.ts`**

```ts
// Append to lib/jira/client.ts
export async function searchIssues(
  accessToken: string,
  cloudId: string,
  jql: string,
  maxResults = 10,
): Promise<Array<{ key: string; title: string }>> {
  type Resp = { issues: Array<{ key: string; fields?: { summary?: string } }> };
  const data = await jiraFetch<Resp>(accessToken, cloudId, "/rest/api/3/search/jql", {
    method: "POST",
    body: { jql, fields: ["summary"], maxResults },
  });
  return (data.issues ?? []).map((i) => ({ key: i.key, title: i.fields?.summary ?? "" }));
}
```

Add to the `lib/jira/index.ts` re-exports.

- [ ] **Step 4: Create `app/api/jira/issue-search/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getValidSession, isJiraError, searchIssues } from "@/lib/jira";
import { ISSUE_KEY_REGEX } from "@/lib/jira/metadata";

export const runtime = "nodejs";

const MAX = 10;

function escapeJqlString(s: string): string {
  return s.replace(/["\\]/g, "\\$&");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cloudId = url.searchParams.get("cloudId");
  const q = url.searchParams.get("q");
  const projectKey = url.searchParams.get("projectKey");

  if (!cloudId) {
    return NextResponse.json({ error: "cloudId is required" }, { status: 400 });
  }
  if (!q || q.length < 2) {
    return NextResponse.json({ error: "q must be at least 2 chars" }, { status: 400 });
  }

  const escaped = escapeJqlString(q);
  const isKey = ISSUE_KEY_REGEX.test(q);
  const parts: string[] = isKey
    ? [`key = "${escaped}"`]
    : [`text ~ "${escaped}"`];
  if (projectKey) parts.unshift(`project = "${escapeJqlString(projectKey)}"`);
  const jql = parts.join(" AND ") + " ORDER BY updated DESC";

  try {
    const session = await getValidSession();
    const issues = await searchIssues(session.accessToken, cloudId, jql, MAX);
    return NextResponse.json({ issues });
  } catch (err) {
    if (isJiraError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 5: Run tests**

Run: `npm run test -- jira-issue-search`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/jira/client.ts lib/jira/index.ts app/api/jira/issue-search/route.ts tests/api/jira-issue-search.test.ts
git commit -m "feat(AI-35): add /api/jira/issue-search typeahead route"
```

---

### Task 5: `listLinkTypes` client helper + `GET /api/jira/link-types` route

**Files:**
- Modify: `lib/jira/client.ts`
- Create: `app/api/jira/link-types/route.ts`
- Create: `tests/api/jira-link-types.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/api/jira-link-types.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/jira", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jira")>("@/lib/jira");
  return {
    ...actual,
    getValidSession: vi.fn(async () => ({ accessToken: "tok" })),
    listLinkTypes: vi.fn(async () => [
      { id: "10000", name: "Relates", inward: "relates to", outward: "relates to" },
      { id: "10001", name: "Blocks", inward: "is blocked by", outward: "blocks" },
    ]),
  };
});

import { GET } from "@/app/api/jira/link-types/route";

describe("GET /api/jira/link-types", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when cloudId is missing", async () => {
    const res = await GET(new Request("http://x/api/jira/link-types"));
    expect(res.status).toBe(400);
  });

  it("returns the link-types list", async () => {
    const res = await GET(new Request("http://x/api/jira/link-types?cloudId=c1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      linkTypes: [
        { id: "10000", name: "Relates", inward: "relates to", outward: "relates to" },
        { id: "10001", name: "Blocks", inward: "is blocked by", outward: "blocks" },
      ],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- jira-link-types`
Expected: FAIL.

- [ ] **Step 3: Add `listLinkTypes` to `lib/jira/client.ts`**

```ts
export type JiraLinkType = {
  id: string;
  name: string;
  inward: string;
  outward: string;
};

export async function listLinkTypes(
  accessToken: string,
  cloudId: string,
): Promise<JiraLinkType[]> {
  type Resp = { issueLinkTypes: JiraLinkType[] };
  const data = await jiraFetch<Resp>(accessToken, cloudId, "/rest/api/3/issueLinkType");
  return data.issueLinkTypes ?? [];
}
```

Re-export `listLinkTypes` and `JiraLinkType` in `lib/jira/index.ts`.

- [ ] **Step 4: Create `app/api/jira/link-types/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getValidSession, isJiraError, listLinkTypes } from "@/lib/jira";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cloudId = url.searchParams.get("cloudId");
  if (!cloudId) {
    return NextResponse.json({ error: "cloudId is required" }, { status: 400 });
  }
  try {
    const session = await getValidSession();
    const linkTypes = await listLinkTypes(session.accessToken, cloudId);
    return NextResponse.json({ linkTypes });
  } catch (err) {
    if (isJiraError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 5: Run tests**

Run: `npm run test -- jira-link-types`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/jira/client.ts lib/jira/index.ts app/api/jira/link-types/route.ts tests/api/jira-link-types.test.ts
git commit -m "feat(AI-35): add /api/jira/link-types route"
```

---

### Task 6: `GET /api/jira/epics` route

**Files:**
- Create: `app/api/jira/epics/route.ts`
- Create: `tests/api/jira-epics.test.ts`

Uses the existing `searchIssues` helper — no new client helper required.

- [ ] **Step 1: Write the failing test**

```ts
// tests/api/jira-epics.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/jira", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jira")>("@/lib/jira");
  return {
    ...actual,
    getValidSession: vi.fn(async () => ({ accessToken: "tok" })),
    searchIssues: vi.fn(async () => [
      { key: "EPIC-9", title: "Auth rework" },
      { key: "EPIC-10", title: "Reporting v2" },
    ]),
  };
});

import { GET } from "@/app/api/jira/epics/route";
import { searchIssues } from "@/lib/jira";

describe("GET /api/jira/epics", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when cloudId or projectKey missing", async () => {
    const res1 = await GET(new Request("http://x/api/jira/epics?projectKey=PROJ"));
    const res2 = await GET(new Request("http://x/api/jira/epics?cloudId=c1"));
    expect(res1.status).toBe(400);
    expect(res2.status).toBe(400);
  });

  it("builds a JQL filtered by project and Epic type, excluding Done", async () => {
    await GET(new Request("http://x/api/jira/epics?cloudId=c1&projectKey=PROJ"));
    const jql = vi.mocked(searchIssues).mock.calls[0][2];
    expect(jql).toContain('project = "PROJ"');
    expect(jql).toContain("issuetype = Epic");
    expect(jql).toContain("statusCategory != Done");
  });

  it("appends summary/key filter when q is provided", async () => {
    await GET(new Request("http://x/api/jira/epics?cloudId=c1&projectKey=PROJ&q=auth"));
    const jql = vi.mocked(searchIssues).mock.calls[0][2];
    expect(jql).toContain('summary ~ "auth"');
  });

  it("returns the epic list", async () => {
    const res = await GET(new Request("http://x/api/jira/epics?cloudId=c1&projectKey=PROJ"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      epics: [
        { key: "EPIC-9", title: "Auth rework" },
        { key: "EPIC-10", title: "Reporting v2" },
      ],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- jira-epics`
Expected: FAIL.

- [ ] **Step 3: Create `app/api/jira/epics/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getValidSession, isJiraError, searchIssues } from "@/lib/jira";

export const runtime = "nodejs";

function escapeJqlString(s: string): string {
  return s.replace(/["\\]/g, "\\$&");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cloudId = url.searchParams.get("cloudId");
  const projectKey = url.searchParams.get("projectKey");
  const q = url.searchParams.get("q");
  if (!cloudId) return NextResponse.json({ error: "cloudId is required" }, { status: 400 });
  if (!projectKey) return NextResponse.json({ error: "projectKey is required" }, { status: 400 });

  const parts: string[] = [
    `project = "${escapeJqlString(projectKey)}"`,
    "issuetype = Epic",
    "statusCategory != Done",
  ];
  if (q && q.trim().length > 0) {
    const escaped = escapeJqlString(q.trim());
    parts.push(`(summary ~ "${escaped}" OR key = "${escaped}")`);
  }
  const jql = parts.join(" AND ") + " ORDER BY updated DESC";

  try {
    const session = await getValidSession();
    const epics = await searchIssues(session.accessToken, cloudId, jql, 50);
    return NextResponse.json({ epics });
  } catch (err) {
    if (isJiraError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test -- jira-epics`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add app/api/jira/epics/route.ts tests/api/jira-epics.test.ts
git commit -m "feat(AI-35): add /api/jira/epics route"
```

---

### Task 7: `createIssueLink` + `addComment` client helpers

**Files:**
- Modify: `lib/jira/client.ts`
- Create: `tests/lib/jira-client-helpers.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/jira-client-helpers.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { createIssueLink, addComment } from "@/lib/jira/client";

describe("lib/jira/client extra helpers", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(null, { status: 201 }));
  });

  it("createIssueLink POSTs to /issueLink with the link payload", async () => {
    await createIssueLink("tok", "cloud-1", {
      type: { id: "10001" },
      inwardIssue: { key: "ABC-1" },
      outwardIssue: { key: "PROJ-9" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/rest/api/3/issueLink");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({
      type: { id: "10001" },
      inwardIssue: { key: "ABC-1" },
      outwardIssue: { key: "PROJ-9" },
    });
  });

  it("addComment POSTs ADF body to /issue/{key}/comment", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "c1" }), { status: 201 }));
    const adf = { type: "doc", version: 1, content: [] };
    await addComment("tok", "cloud-1", "PROJ-9", adf);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/rest/api/3/issue/PROJ-9/comment");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({ body: adf });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- jira-client-helpers`
Expected: FAIL.

- [ ] **Step 3: Add helpers to `lib/jira/client.ts`**

```ts
// Append to lib/jira/client.ts

export type IssueLinkBody = {
  type: { id?: string; name?: string };
  inwardIssue: { key: string };
  outwardIssue: { key: string };
};

export async function createIssueLink(
  accessToken: string,
  cloudId: string,
  body: IssueLinkBody,
): Promise<void> {
  await jiraFetch<void>(accessToken, cloudId, "/rest/api/3/issueLink", {
    method: "POST",
    body,
  });
}

export async function addComment(
  accessToken: string,
  cloudId: string,
  issueKey: string,
  adfBody: unknown,
): Promise<{ id: string }> {
  return jiraFetch<{ id: string }>(
    accessToken,
    cloudId,
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`,
    { method: "POST", body: { body: adfBody } },
  );
}
```

Re-export both from `lib/jira/index.ts`.

- [ ] **Step 4: Run tests**

Run: `npm run test -- jira-client-helpers`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/jira/client.ts lib/jira/index.ts tests/lib/jira-client-helpers.test.ts
git commit -m "feat(AI-35): add createIssueLink and addComment client helpers"
```

---

### Task 8: Field-resolution helpers in `lib/jira/export.ts`

**Files:**
- Modify: `lib/jira/export.ts` (add internal helpers + export them for tests)
- Create: `tests/lib/jira-export-field-resolution.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/jira-export-field-resolution.test.ts
import { describe, it, expect } from "vitest";
import {
  findEpicLinkField,
  findFlaggedField,
  findLabelsField,
} from "@/lib/jira/export";

describe("export field resolution", () => {
  it("findEpicLinkField returns parent for team-managed (modern) projects", () => {
    const fields = {
      parent: { required: false, name: "Parent" },
      summary: { required: true, name: "Summary" },
    };
    expect(findEpicLinkField(fields)).toEqual({ id: "parent", mode: "parent" });
  });

  it("findEpicLinkField returns the epic-link custom field for company-managed projects", () => {
    const fields = {
      customfield_10014: {
        required: false,
        name: "Epic Link",
        schema: { type: "any", custom: "com.pyxis.greenhopper.jira:gh-epic-link" },
      },
    };
    expect(findEpicLinkField(fields)).toEqual({ id: "customfield_10014", mode: "epic-link" });
  });

  it("findEpicLinkField returns null when neither is present", () => {
    expect(findEpicLinkField({ summary: { required: true, name: "Summary" } })).toBeNull();
  });

  it("findFlaggedField matches the Flagged system field by name", () => {
    const fields = {
      customfield_10021: {
        required: false,
        name: "Flagged",
        schema: { type: "array", items: "option" },
      },
    };
    expect(findFlaggedField(fields)).toEqual({ id: "customfield_10021" });
  });

  it("findFlaggedField returns null when no Flagged field exists", () => {
    expect(findFlaggedField({ summary: { required: true, name: "Summary" } })).toBeNull();
  });

  it("findLabelsField returns true when the system labels field exists", () => {
    expect(findLabelsField({ labels: { required: false, name: "Labels" } })).toBe(true);
    expect(findLabelsField({})).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- jira-export-field-resolution`
Expected: FAIL — helpers do not exist.

- [ ] **Step 3: Add helpers to `lib/jira/export.ts`**

Add these export functions at the top of the file (above `exportToJira`):

```ts
import type { JiraFieldMeta } from "./client";

export function findEpicLinkField(
  fields: Record<string, JiraFieldMeta>,
): { id: string; mode: "parent" | "epic-link" } | null {
  if ("parent" in fields) return { id: "parent", mode: "parent" };
  for (const [id, meta] of Object.entries(fields)) {
    const custom = meta.schema?.custom ?? "";
    if (/epic-link/i.test(custom)) return { id, mode: "epic-link" };
  }
  return null;
}

export function findFlaggedField(
  fields: Record<string, JiraFieldMeta>,
): { id: string } | null {
  for (const [id, meta] of Object.entries(fields)) {
    if (/^flag(ged)?$/i.test(meta.name)) return { id };
  }
  return null;
}

export function findLabelsField(fields: Record<string, JiraFieldMeta>): boolean {
  return "labels" in fields;
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test -- jira-export-field-resolution`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/jira/export.ts tests/lib/jira-export-field-resolution.test.ts
git commit -m "feat(AI-35): add field-resolution helpers for epic / flagged / labels"
```

---

### Task 9: Extend `exportToJira` — labels, epic, flag in createIssue payload

**Files:**
- Modify: `lib/jira/export.ts`
- Create: `tests/lib/jira-export-metadata-create.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/jira-export-metadata-create.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/jira/client", () => ({
  createIssue: vi.fn(async () => ({ key: "PROJ-100" })),
  listCreateFields: vi.fn(),
  listCreatableIssueTypes: vi.fn(),
  uploadAttachment: vi.fn(async () => undefined),
  createIssueLink: vi.fn(async () => undefined),
  addComment: vi.fn(async () => ({ id: "c1" })),
}));

vi.mock("@/lib/jira/oauth", () => ({
  listAccessibleResources: vi.fn(async () => [
    { id: "cloud-1", url: "https://example.atlassian.net" },
  ]),
}));

import { exportToJira } from "@/lib/jira/export";
import { createIssue, listCreateFields } from "@/lib/jira/client";

const create = vi.mocked(createIssue);
const meta = vi.mocked(listCreateFields);

const baseBody = {
  cloudId: "cloud-1",
  projectKey: "PROJ",
  issueTypeId: "10001",
  payload: {
    story: { title: "T", markdown: "# T" },
    markdown: "# Edited",
  },
};

describe("exportToJira — metadata routed into createIssue", () => {
  beforeEach(() => {
    create.mockClear();
    meta.mockReset();
  });

  it("sets fields.labels when labels system field exists and metadata.labels has values", async () => {
    meta.mockResolvedValue({
      labels: { required: false, name: "Labels" },
    } as any);
    await exportToJira("tok", { ...baseBody, metadata: { labels: ["backend", "v2"] } });
    expect(create.mock.calls[0][2].labels).toEqual(["backend", "v2"]);
  });

  it("skips labels when project lacks a labels field", async () => {
    meta.mockResolvedValue({} as any);
    await exportToJira("tok", { ...baseBody, metadata: { labels: ["backend"] } });
    expect(create.mock.calls[0][2].labels).toBeUndefined();
  });

  it("sets `parent` for team-managed epic when epic.kind=existing", async () => {
    meta.mockResolvedValue({ parent: { required: false, name: "Parent" } } as any);
    await exportToJira("tok", {
      ...baseBody,
      metadata: { epic: { kind: "existing", key: "EPIC-9" } },
    });
    expect(create.mock.calls[0][2].parent).toEqual({ key: "EPIC-9" });
  });

  it("sets the custom Epic Link field for company-managed projects", async () => {
    meta.mockResolvedValue({
      customfield_10014: {
        required: false,
        name: "Epic Link",
        schema: { type: "any", custom: "com.pyxis.greenhopper.jira:gh-epic-link" },
      },
    } as any);
    await exportToJira("tok", {
      ...baseBody,
      metadata: { epic: { kind: "existing", key: "EPIC-9" } },
    });
    expect(create.mock.calls[0][2].customfield_10014).toBe("EPIC-9");
  });

  it("sets Flagged field when metadata.flagged is true and Flagged field exists", async () => {
    meta.mockResolvedValue({
      customfield_10021: {
        required: false,
        name: "Flagged",
        schema: { type: "array", items: "option" },
      },
    } as any);
    await exportToJira("tok", {
      ...baseBody,
      metadata: { flagged: true, flagReason: "needs auth refactor" },
    });
    expect(create.mock.calls[0][2].customfield_10021).toEqual([{ value: "Impediment" }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- jira-export-metadata-create`
Expected: FAIL — metadata not yet routed.

- [ ] **Step 3: Extend `exportToJira` in `lib/jira/export.ts`**

Replace the existing `fields` build block with one that consumes metadata:

```ts
// After acField resolution, also resolve the new fields:
const epicField = findEpicLinkField(fieldMeta);
const flaggedField = findFlaggedField(fieldMeta);
const labelsAvailable = findLabelsField(fieldMeta);

// ... existing fields {} build ...

const metadata = body.metadata;

if (metadata?.labels && metadata.labels.length > 0 && labelsAvailable) {
  fields.labels = metadata.labels;
}

if (metadata?.epic && metadata.epic.kind === "existing" && epicField) {
  fields[epicField.id] =
    epicField.mode === "parent" ? { key: metadata.epic.key } : metadata.epic.key;
}

if (metadata?.flagged && flaggedField) {
  fields[flaggedField.id] = [{ value: "Impediment" }];
}
```

Update the return-type `ExportResult` to add (additive):

```ts
export type ExportResult = {
  key: string;
  url: string;
  attachments: Partial<Record<MermaidFormat, "ok" | "failed">>;
  attachmentErrors: Partial<Record<MermaidFormat, string>>;
  autoFilledFields: string[];
  missingRequiredFields: string[];
  // NEW — populated by tasks 10 and 11 below; default to empty/skipped for now
  linkResults?: { ok: string[]; failed: Array<{ key: string; error: string }> };
  flagCommentResult?: "ok" | "skipped" | "failed";
  flagCommentError?: string;
  epicCreated?: { key: string };
};
```

- [ ] **Step 4: Run tests**

Run: `npm run test -- jira-export`
Expected: PASS — previously existing AI-34 tests still green, 5 new tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/jira/export.ts tests/lib/jira-export-metadata-create.test.ts
git commit -m "feat(AI-35): route labels / epic / flagged metadata into createIssue"
```

---

### Task 10: Post-create steps — issue links and flag comment

**Files:**
- Modify: `lib/jira/export.ts`
- Create: `tests/lib/jira-export-post-create.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/jira-export-post-create.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/jira/client", () => ({
  createIssue: vi.fn(async () => ({ key: "PROJ-100" })),
  listCreateFields: vi.fn(async () => ({})),
  listCreatableIssueTypes: vi.fn(),
  uploadAttachment: vi.fn(async () => undefined),
  createIssueLink: vi.fn(async () => undefined),
  addComment: vi.fn(async () => ({ id: "c1" })),
}));

vi.mock("@/lib/jira/oauth", () => ({
  listAccessibleResources: vi.fn(async () => [
    { id: "cloud-1", url: "https://example.atlassian.net" },
  ]),
}));

import { exportToJira } from "@/lib/jira/export";
import { createIssueLink, addComment } from "@/lib/jira/client";

const link = vi.mocked(createIssueLink);
const comment = vi.mocked(addComment);

const baseBody = {
  cloudId: "cloud-1",
  projectKey: "PROJ",
  issueTypeId: "10001",
  payload: { story: { title: "T", markdown: "# T" }, markdown: "# Edited" },
};

beforeEach(() => {
  link.mockClear();
  link.mockResolvedValue(undefined);
  comment.mockClear();
  comment.mockResolvedValue({ id: "c1" });
});

describe("exportToJira — post-create steps", () => {
  it("creates one issue link per linkedIssue, in parallel, with outward = main issue", async () => {
    const result = await exportToJira("tok", {
      ...baseBody,
      metadata: {
        linkedIssues: [
          { key: "ABC-1", linkTypeId: "10000" },
          { key: "ABC-2", linkTypeId: "10001" },
        ],
      },
    });
    expect(link).toHaveBeenCalledTimes(2);
    expect(link.mock.calls[0][2]).toEqual({
      type: { id: "10000" },
      inwardIssue: { key: "ABC-1" },
      outwardIssue: { key: "PROJ-100" },
    });
    expect(result.linkResults?.ok).toEqual(["ABC-1", "ABC-2"]);
    expect(result.linkResults?.failed).toEqual([]);
  });

  it("collects per-link failures without aborting the export", async () => {
    link.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("link-fail"));
    const result = await exportToJira("tok", {
      ...baseBody,
      metadata: {
        linkedIssues: [
          { key: "ABC-1", linkTypeId: "10000" },
          { key: "ABC-2", linkTypeId: "10001" },
        ],
      },
    });
    expect(result.linkResults?.ok).toEqual(["ABC-1"]);
    expect(result.linkResults?.failed).toEqual([{ key: "ABC-2", error: "link-fail" }]);
  });

  it("posts a 'Flagged: <reason>' comment when flagged=true with a reason", async () => {
    const result = await exportToJira("tok", {
      ...baseBody,
      metadata: { flagged: true, flagReason: "blocked on auth refactor" },
    });
    expect(comment).toHaveBeenCalledTimes(1);
    const [, , issueKey, adf] = comment.mock.calls[0];
    expect(issueKey).toBe("PROJ-100");
    expect(JSON.stringify(adf)).toContain("Flagged: blocked on auth refactor");
    expect(result.flagCommentResult).toBe("ok");
  });

  it("does not post a comment when flagged is false", async () => {
    await exportToJira("tok", { ...baseBody, metadata: { flagged: false } });
    expect(comment).not.toHaveBeenCalled();
  });

  it("collects flag-comment failure without aborting", async () => {
    comment.mockRejectedValueOnce(new Error("comment-fail"));
    const result = await exportToJira("tok", {
      ...baseBody,
      metadata: { flagged: true, flagReason: "x".repeat(20) },
    });
    expect(result.flagCommentResult).toBe("failed");
    expect(result.flagCommentError).toBe("comment-fail");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- jira-export-post-create`
Expected: FAIL.

- [ ] **Step 3: Add post-create steps to `exportToJira`**

After the `createIssue` call returns `created`:

```ts
import { addComment, createIssueLink } from "./client";

// ---- Post-create: issue links ----
const linkResults: { ok: string[]; failed: Array<{ key: string; error: string }> } = {
  ok: [],
  failed: [],
};
if (metadata?.linkedIssues && metadata.linkedIssues.length > 0) {
  await Promise.all(
    metadata.linkedIssues.map(async (l) => {
      try {
        await createIssueLink(accessToken, body.cloudId, {
          type: { id: l.linkTypeId },
          inwardIssue: { key: l.key },
          outwardIssue: { key: created.key },
        });
        linkResults.ok.push(l.key);
      } catch (err) {
        linkResults.failed.push({
          key: l.key,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );
}

// ---- Post-create: flag comment ----
let flagCommentResult: "ok" | "skipped" | "failed" = "skipped";
let flagCommentError: string | undefined;
if (metadata?.flagged && metadata.flagReason) {
  try {
    const adfBody = {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: `Flagged: ${metadata.flagReason}` }],
        },
      ],
    };
    await addComment(accessToken, body.cloudId, created.key, adfBody);
    flagCommentResult = "ok";
  } catch (err) {
    flagCommentResult = "failed";
    flagCommentError = err instanceof Error ? err.message : String(err);
  }
}
```

Then include in the return:

```ts
return {
  key: created.key,
  url,
  attachments,
  attachmentErrors,
  autoFilledFields: autoFilled,
  missingRequiredFields: missingRequired,
  linkResults,
  flagCommentResult,
  flagCommentError,
};
```

- [ ] **Step 4: Run tests**

Run: `npm run test -- jira-export-post-create`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/jira/export.ts tests/lib/jira-export-post-create.test.ts
git commit -m "feat(AI-35): post-create issue links and flag comment"
```

---

### Task 11: Inline epic pre-creation

**Files:**
- Modify: `lib/jira/export.ts`
- Create: `tests/lib/jira-export-epic-create.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/jira-export-epic-create.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const createIssueMock = vi.fn();
const listCreatableIssueTypesMock = vi.fn();

vi.mock("@/lib/jira/client", () => ({
  createIssue: (...args: unknown[]) => createIssueMock(...args),
  listCreateFields: vi.fn(async () => ({
    parent: { required: false, name: "Parent" },
  })),
  listCreatableIssueTypes: (...args: unknown[]) => listCreatableIssueTypesMock(...args),
  uploadAttachment: vi.fn(async () => undefined),
  createIssueLink: vi.fn(async () => undefined),
  addComment: vi.fn(async () => ({ id: "c1" })),
}));

vi.mock("@/lib/jira/oauth", () => ({
  listAccessibleResources: vi.fn(async () => [
    { id: "cloud-1", url: "https://example.atlassian.net" },
  ]),
}));

import { exportToJira } from "@/lib/jira/export";

const baseBody = {
  cloudId: "cloud-1",
  projectKey: "PROJ",
  issueTypeId: "10001",
  payload: { story: { title: "T", markdown: "# T" }, markdown: "# Edited" },
};

beforeEach(() => {
  createIssueMock.mockReset();
  listCreatableIssueTypesMock.mockReset();
});

describe("exportToJira — inline epic creation", () => {
  it("pre-creates an Epic and uses its key as the parent of the main issue", async () => {
    listCreatableIssueTypesMock.mockResolvedValue([
      { id: "10001", name: "Task" },
      { id: "10010", name: "Epic" },
    ]);
    createIssueMock
      .mockResolvedValueOnce({ key: "EPIC-200" }) // first call = Epic
      .mockResolvedValueOnce({ key: "PROJ-100" }); // second call = main

    const result = await exportToJira("tok", {
      ...baseBody,
      metadata: { epic: { kind: "new", title: "New epic from task creator" } },
    });

    expect(createIssueMock).toHaveBeenCalledTimes(2);
    expect(createIssueMock.mock.calls[0][2].issuetype).toEqual({ id: "10010" });
    expect(createIssueMock.mock.calls[0][2].summary).toBe("New epic from task creator");
    expect(createIssueMock.mock.calls[1][2].parent).toEqual({ key: "EPIC-200" });
    expect(result.epicCreated).toEqual({ key: "EPIC-200" });
  });

  it("throws a structured error when no Epic issuetype exists in the project", async () => {
    listCreatableIssueTypesMock.mockResolvedValue([{ id: "10001", name: "Task" }]);
    await expect(
      exportToJira("tok", {
        ...baseBody,
        metadata: { epic: { kind: "new", title: "Will fail" } },
      }),
    ).rejects.toThrow(/no Epic issuetype/i);
    expect(createIssueMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- jira-export-epic-create`
Expected: FAIL.

- [ ] **Step 3: Add epic pre-create to `lib/jira/export.ts`**

Before the main `createIssue` call:

```ts
import { listCreatableIssueTypes } from "./client";

let epicCreated: { key: string } | undefined;
let resolvedEpicKey: string | null = null;

if (metadata?.epic) {
  if (metadata.epic.kind === "existing") {
    resolvedEpicKey = metadata.epic.key;
  } else {
    // kind === "new"  → pre-create an Epic issue
    const types = await listCreatableIssueTypes(accessToken, body.cloudId, body.projectKey);
    const epicType = types.find((t) => /^epic$/i.test(t.name));
    if (!epicType) {
      throw new Error(
        "Cannot create epic inline: no Epic issuetype is available in this project.",
      );
    }
    const epicCreate = await createIssue(accessToken, body.cloudId, {
      summary: metadata.epic.title.slice(0, 250),
      project: { key: body.projectKey },
      issuetype: { id: epicType.id },
      description: {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Created from task creator." }],
          },
        ],
      },
    });
    resolvedEpicKey = epicCreate.key;
    epicCreated = { key: epicCreate.key };
  }
}

// In the main fields build, replace the prior "existing-only" handling with:
if (resolvedEpicKey && epicField) {
  fields[epicField.id] =
    epicField.mode === "parent" ? { key: resolvedEpicKey } : resolvedEpicKey;
}
```

Add `epicCreated` to the return object.

- [ ] **Step 4: Run tests**

Run: `npm run test -- jira-export`
Expected: All export tests pass, including the new 2.

- [ ] **Step 5: Commit**

```bash
git add lib/jira/export.ts tests/lib/jira-export-epic-create.test.ts
git commit -m "feat(AI-35): inline epic creation in exportToJira"
```

---

### Task 12: `POST /api/jira/export-attachments` route (multipart)

**Files:**
- Create: `app/api/jira/export-attachments/route.ts`
- Create: `tests/api/jira-export-attachments.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/api/jira-export-attachments.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/jira", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jira")>("@/lib/jira");
  return {
    ...actual,
    getValidSession: vi.fn(async () => ({ accessToken: "tok" })),
    uploadAttachment: vi.fn(async () => undefined),
  };
});

import { POST } from "@/app/api/jira/export-attachments/route";

function makeRequest(form: FormData): Request {
  return new Request("http://x/api/jira/export-attachments", {
    method: "POST",
    body: form,
  });
}

describe("POST /api/jira/export-attachments", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when cloudId is missing", async () => {
    const form = new FormData();
    form.append("issueKey", "PROJ-1");
    form.append("file", new File(["x"], "x.txt"));
    const res = await POST(makeRequest(form));
    expect(res.status).toBe(400);
  });

  it("returns 400 when file is missing", async () => {
    const form = new FormData();
    form.append("cloudId", "c1");
    form.append("issueKey", "PROJ-1");
    const res = await POST(makeRequest(form));
    expect(res.status).toBe(400);
  });

  it("returns 413 when file exceeds the configured max size", async () => {
    const oldMax = process.env.JIRA_DRAFT_ATTACHMENT_MAX_MB;
    process.env.JIRA_DRAFT_ATTACHMENT_MAX_MB = "0";  // any non-empty file > 0 MiB
    try {
      const form = new FormData();
      form.append("cloudId", "c1");
      form.append("issueKey", "PROJ-1");
      form.append("file", new File([new Uint8Array(1024)], "big.bin"));
      const res = await POST(makeRequest(form));
      expect(res.status).toBe(413);
    } finally {
      process.env.JIRA_DRAFT_ATTACHMENT_MAX_MB = oldMax;
    }
  });

  it("forwards the file to uploadAttachment on success", async () => {
    const form = new FormData();
    form.append("cloudId", "c1");
    form.append("issueKey", "PROJ-1");
    form.append("file", new File(["hello"], "hello.txt", { type: "text/plain" }));
    const res = await POST(makeRequest(form));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- jira-export-attachments`
Expected: FAIL.

- [ ] **Step 3: Add a binary `uploadAttachmentBinary` helper to `lib/jira/client.ts`**

The current `uploadAttachment` takes a `string` content. We need binary, so add:

```ts
export async function uploadAttachmentBinary(
  accessToken: string,
  cloudId: string,
  issueKey: string,
  filename: string,
  data: Uint8Array,
  contentType: string,
): Promise<JiraAttachment[]> {
  const boundary = "----TaskCreatorBoundary" + Math.random().toString(36).slice(2);
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename.replace(/"/g, '\\"')}"\r\n` +
      `Content-Type: ${contentType || "application/octet-stream"}\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--\r\n`);
  const buf = new Uint8Array(head.length + data.length + tail.length);
  buf.set(head, 0);
  buf.set(data, head.length);
  buf.set(tail, head.length + data.length);
  return jiraFetch<JiraAttachment[]>(
    accessToken,
    cloudId,
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}/attachments`,
    {
      method: "POST",
      rawBody: buf,
      contentType: `multipart/form-data; boundary=${boundary}`,
      noCheck: true,
    },
  );
}
```

Re-export from `lib/jira/index.ts`.

- [ ] **Step 4: Create `app/api/jira/export-attachments/route.ts`**

```ts
import { NextResponse } from "next/server";
import {
  getValidSession,
  isJiraError,
  uploadAttachmentBinary,
  readDraftAttachmentMaxBytes,
} from "@/lib/jira";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 });
  }

  const cloudId = form.get("cloudId");
  const issueKey = form.get("issueKey");
  const file = form.get("file");

  if (typeof cloudId !== "string" || !cloudId) {
    return NextResponse.json({ error: "cloudId is required" }, { status: 400 });
  }
  if (typeof issueKey !== "string" || !issueKey) {
    return NextResponse.json({ error: "issueKey is required" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const max = readDraftAttachmentMaxBytes();
  if (file.size > max) {
    return NextResponse.json(
      { error: `file too large: max ${max} bytes`, max },
      { status: 413 },
    );
  }

  try {
    const session = await getValidSession();
    const data = new Uint8Array(await file.arrayBuffer());
    await uploadAttachmentBinary(
      session.accessToken,
      cloudId,
      issueKey,
      file.name,
      data,
      file.type || "application/octet-stream",
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isJiraError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 5: Run tests**

Run: `npm run test -- jira-export-attachments`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/jira/client.ts lib/jira/index.ts app/api/jira/export-attachments/route.ts tests/api/jira-export-attachments.test.ts
git commit -m "feat(AI-35): add /api/jira/export-attachments multipart route"
```

---

### Task 13: Client-side hooks (`useJiraLabels`, `useIssueSearch`, `useEpics`, `useLinkTypes`)

**Files:**
- Create: `components/jira-metadata/hooks.ts`
- Create: `tests/components/jira-metadata/hooks.test.ts`

These are small data hooks. They share a debounce-and-fetch shape; the link-types hook caches once per `cloudId`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/components/jira-metadata/hooks.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import {
  useJiraLabels,
  useIssueSearch,
  useEpics,
  useLinkTypes,
} from "@/components/jira-metadata/hooks";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ labels: ["backend"] }), { status: 200 }),
  );
});

describe("hooks", () => {
  it("useJiraLabels debounces and exposes loading/data/error", async () => {
    const { result, rerender } = renderHook(({ q }: { q: string }) =>
      useJiraLabels("c1", q, { debounceMs: 50 }),
    , { initialProps: { q: "" } });

    expect(result.current.loading).toBe(false);
    rerender({ q: "ba" });
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual(["backend"]);
  });

  it("useIssueSearch requires q.length >= 2 before fetching", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ issues: [] }), { status: 200 }),
    );
    const { result, rerender } = renderHook(({ q }: { q: string }) =>
      useIssueSearch("c1", "PROJ", q, { debounceMs: 50 }),
    , { initialProps: { q: "a" } });
    await new Promise((r) => setTimeout(r, 100));
    expect(fetchMock).not.toHaveBeenCalled();
    rerender({ q: "ab" });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it("useEpics fetches once per (cloudId, projectKey, q) and exposes retry", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 500 }));
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ epics: [{ key: "EPIC-1", title: "Auth" }] }), {
        status: 200,
      }),
    );
    const { result } = renderHook(() => useEpics("c1", "PROJ"));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    await act(async () => {
      await result.current.retry();
    });
    await waitFor(() => expect(result.current.data).toEqual([{ key: "EPIC-1", title: "Auth" }]));
  });

  it("useLinkTypes caches across remounts for the same cloudId", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ linkTypes: [{ id: "10000", name: "Relates", inward: "relates to", outward: "relates to" }] }), { status: 200 }),
    );
    const { unmount } = renderHook(() => useLinkTypes("c1"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    fetchMock.mockClear();
    unmount();
    renderHook(() => useLinkTypes("c1"));
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- jira-metadata/hooks`
Expected: FAIL.

- [ ] **Step 3: Create `components/jira-metadata/hooks.ts`**

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type FetchState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  retry: () => Promise<void>;
};

const DEFAULT_DEBOUNCE_MS = 250;

type LinkType = { id: string; name: string; inward: string; outward: string };

// Cross-mount cache for link types — small and rarely changes per site.
const linkTypeCache = new Map<string, LinkType[]>();

function useDebouncedFetch<T>(
  url: string | null,
  parse: (raw: unknown) => T,
  debounceMs: number,
): FetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (target: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(target, { credentials: "same-origin", signal: ctrl.signal });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : `Request failed (${res.status})`);
        setData(null);
      } else {
        setData(parse(json));
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Network error");
      setData(null);
    } finally {
      if (abortRef.current === ctrl) setLoading(false);
    }
  }, [parse]);

  useEffect(() => {
    if (!url) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    const id = window.setTimeout(() => run(url), debounceMs);
    return () => window.clearTimeout(id);
  }, [url, debounceMs, run]);

  const retry = useCallback(async () => {
    if (url) await run(url);
  }, [url, run]);

  return { data, loading, error, retry };
}

export function useJiraLabels(
  cloudId: string | null,
  q: string,
  opts: { debounceMs?: number } = {},
) {
  const url = cloudId && q.trim().length >= 1
    ? `/api/jira/labels?cloudId=${encodeURIComponent(cloudId)}&q=${encodeURIComponent(q.trim())}`
    : null;
  return useDebouncedFetch<string[]>(
    url,
    (raw) => (raw as { labels?: string[] }).labels ?? [],
    opts.debounceMs ?? DEFAULT_DEBOUNCE_MS,
  );
}

export function useIssueSearch(
  cloudId: string | null,
  projectKey: string | null,
  q: string,
  opts: { debounceMs?: number } = {},
) {
  const url = cloudId && q.trim().length >= 2
    ? `/api/jira/issue-search?cloudId=${encodeURIComponent(cloudId)}&q=${encodeURIComponent(q.trim())}${projectKey ? `&projectKey=${encodeURIComponent(projectKey)}` : ""}`
    : null;
  return useDebouncedFetch<Array<{ key: string; title: string }>>(
    url,
    (raw) => (raw as { issues?: Array<{ key: string; title: string }> }).issues ?? [],
    opts.debounceMs ?? DEFAULT_DEBOUNCE_MS,
  );
}

export function useEpics(
  cloudId: string | null,
  projectKey: string | null,
  q: string = "",
  opts: { debounceMs?: number } = {},
) {
  const url = cloudId && projectKey
    ? `/api/jira/epics?cloudId=${encodeURIComponent(cloudId)}&projectKey=${encodeURIComponent(projectKey)}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`
    : null;
  return useDebouncedFetch<Array<{ key: string; title: string }>>(
    url,
    (raw) => (raw as { epics?: Array<{ key: string; title: string }> }).epics ?? [],
    opts.debounceMs ?? DEFAULT_DEBOUNCE_MS,
  );
}

export function useLinkTypes(cloudId: string | null): FetchState<LinkType[]> {
  const [data, setData] = useState<LinkType[] | null>(cloudId ? linkTypeCache.get(cloudId) ?? null : null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (!cloudId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/jira/link-types?cloudId=${encodeURIComponent(cloudId)}`, {
        credentials: "same-origin",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : `Request failed (${res.status})`);
      } else {
        const list: LinkType[] = (json.linkTypes ?? []) as LinkType[];
        linkTypeCache.set(cloudId, list);
        setData(list);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [cloudId]);

  useEffect(() => {
    if (!cloudId) {
      setData(null);
      return;
    }
    if (linkTypeCache.has(cloudId)) {
      setData(linkTypeCache.get(cloudId)!);
      return;
    }
    run();
  }, [cloudId, run]);

  return { data, loading, error, retry: run };
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test -- jira-metadata/hooks`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add components/jira-metadata/hooks.ts tests/components/jira-metadata/hooks.test.ts
git commit -m "feat(AI-35): client hooks for Jira metadata data sources"
```

---

### Task 14: `LabelsField` component

**Files:**
- Create: `components/jira-metadata/LabelsField.tsx`
- Create: `tests/components/jira-metadata/LabelsField.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/jira-metadata/LabelsField.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LabelsField } from "@/components/jira-metadata/LabelsField";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ labels: ["backend", "backend-v2"] }), { status: 200 }),
  );
});

describe("LabelsField", () => {
  it("renders selected labels as removable chips", () => {
    render(<LabelsField cloudId="c1" value={["backend", "v2"]} onChange={() => {}} />);
    expect(screen.getByText("backend")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getAllByLabelText(/^Remove /).length).toBe(2);
  });

  it("shows label suggestions after typing", async () => {
    const user = userEvent.setup();
    render(<LabelsField cloudId="c1" value={[]} onChange={() => {}} />);
    await user.type(screen.getByRole("combobox"), "ba");
    await waitFor(() => expect(screen.getByText("backend")).toBeInTheDocument());
  });

  it("adds a suggestion to the selection on click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<LabelsField cloudId="c1" value={[]} onChange={onChange} />);
    await user.type(screen.getByRole("combobox"), "ba");
    await waitFor(() => screen.getByText("backend"));
    await user.click(screen.getByText("backend"));
    expect(onChange).toHaveBeenCalledWith(["backend"]);
  });

  it("shows a Create '<typed>' row when no exact match exists", async () => {
    const user = userEvent.setup();
    render(<LabelsField cloudId="c1" value={[]} onChange={() => {}} />);
    await user.type(screen.getByRole("combobox"), "newlabel");
    await waitFor(() => expect(screen.getByText(/Create "newlabel"/)).toBeInTheDocument());
  });

  it("disables Create when the typed value matches an existing label (case-insensitive)", async () => {
    const user = userEvent.setup();
    render(<LabelsField cloudId="c1" value={[]} onChange={() => {}} />);
    await user.type(screen.getByRole("combobox"), "Backend");
    await waitFor(() => screen.getByText("backend"));
    expect(screen.queryByText(/Create "Backend"/)).toBeNull();
  });

  it("removes a chip via the remove button", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<LabelsField cloudId="c1" value={["backend"]} onChange={onChange} />);
    await user.click(screen.getByLabelText("Remove backend"));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("shows an error and a retry button when the labels endpoint fails", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 500 }));
    const user = userEvent.setup();
    render(<LabelsField cloudId="c1" value={[]} onChange={() => {}} />);
    await user.type(screen.getByRole("combobox"), "ba");
    await waitFor(() => expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- LabelsField`
Expected: FAIL.

- [ ] **Step 3: Create `components/jira-metadata/LabelsField.tsx`**

```tsx
"use client";

import { useId, useMemo, useState } from "react";
import { useJiraLabels } from "./hooks";
import { dedupeLabels, normalizeLabel } from "@/lib/jira/metadata";

type Props = {
  cloudId: string | null;
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
};

export function LabelsField({ cloudId, value, onChange, disabled }: Props) {
  const [input, setInput] = useState("");
  const listboxId = useId();
  const { data, loading, error, retry } = useJiraLabels(cloudId, input);

  const suggestions = useMemo(() => {
    const valNorm = new Set(value.map(normalizeLabel));
    return (data ?? []).filter((s) => !valNorm.has(normalizeLabel(s)));
  }, [data, value]);

  const trimmed = input.trim();
  const exactMatch = (data ?? []).some((s) => normalizeLabel(s) === normalizeLabel(trimmed));
  const alreadySelected = value.some((s) => normalizeLabel(s) === normalizeLabel(trimmed));
  const showCreate = trimmed.length > 0 && !exactMatch && !alreadySelected;

  function add(label: string) {
    onChange(dedupeLabels([...value, label]));
    setInput("");
  }
  function remove(label: string) {
    onChange(value.filter((l) => normalizeLabel(l) !== normalizeLabel(label)));
  }

  return (
    <div className="flex flex-col gap-1.5" data-field="labels">
      <label className="text-hig-subhead font-medium text-ink">Labels</label>
      <div className="flex flex-wrap gap-1.5 items-center rounded-md border border-rule bg-surface px-2 py-1.5 min-h-10 focus-within:border-accent focus-within:shadow-focus">
        {value.map((l) => (
          <span key={l} className="inline-flex items-center gap-1 rounded-sm bg-surface-muted px-2 py-0.5 text-hig-footnote">
            {l}
            <button
              type="button"
              aria-label={`Remove ${l}`}
              onClick={() => remove(l)}
              disabled={disabled}
              className="opacity-60 hover:opacity-100"
            >×</button>
          </span>
        ))}
        <input
          role="combobox"
          aria-expanded={trimmed.length > 0}
          aria-controls={listboxId}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !input && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          disabled={disabled}
          className="flex-1 min-w-[8ch] bg-transparent outline-none text-hig-body"
          placeholder={value.length ? "" : "Add labels…"}
        />
      </div>
      {trimmed.length > 0 && (
        <ul id={listboxId} role="listbox" className="rounded-md border border-rule bg-surface divide-y divide-rule">
          {loading && <li className="px-3 py-1.5 text-hig-footnote text-ink-secondary">Loading…</li>}
          {error && (
            <li className="px-3 py-1.5 text-hig-footnote text-danger flex items-center gap-2">
              <span>Couldn’t load labels.</span>
              <button type="button" onClick={retry} className="underline">Retry</button>
            </li>
          )}
          {!loading && !error && suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => add(s)}
                className="w-full text-left px-3 py-1.5 text-hig-footnote hover:bg-surface-muted"
              >{s}</button>
            </li>
          ))}
          {!loading && !error && suggestions.length === 0 && !showCreate && (
            <li className="px-3 py-1.5 text-hig-footnote text-ink-secondary">No matching labels.</li>
          )}
          {!loading && !error && showCreate && (
            <li>
              <button
                type="button"
                onClick={() => add(trimmed)}
                className="w-full text-left px-3 py-1.5 text-hig-footnote hover:bg-surface-muted"
              >Create "{trimmed}"</button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test -- LabelsField`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add components/jira-metadata/LabelsField.tsx tests/components/jira-metadata/LabelsField.test.tsx
git commit -m "feat(AI-35): LabelsField component"
```

---

### Task 15: `LinkedIssuesField` component

**Files:**
- Create: `components/jira-metadata/LinkedIssuesField.tsx`
- Create: `tests/components/jira-metadata/LinkedIssuesField.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/jira-metadata/LinkedIssuesField.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LinkedIssuesField } from "@/components/jira-metadata/LinkedIssuesField";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const linkTypes = [
  { id: "10000", name: "Relates", inward: "relates to", outward: "relates to" },
  { id: "10001", name: "Blocks", inward: "is blocked by", outward: "blocks" },
];

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes("/api/jira/link-types")) {
      return new Response(JSON.stringify({ linkTypes }), { status: 200 });
    }
    if (url.includes("/api/jira/issue-search")) {
      return new Response(JSON.stringify({ issues: [{ key: "ABC-1", title: "Add export" }] }), { status: 200 });
    }
    return new Response("", { status: 404 });
  });
});

describe("LinkedIssuesField", () => {
  it("shows results for a 2+ char query", async () => {
    const user = userEvent.setup();
    render(<LinkedIssuesField cloudId="c1" projectKey="PROJ" value={[]} onChange={() => {}} />);
    await user.type(screen.getByRole("combobox"), "add");
    await waitFor(() => expect(screen.getByText("ABC-1")).toBeInTheDocument());
    expect(screen.getByText("Add export")).toBeInTheDocument();
  });

  it("adds a result as a chip with default link type Relates", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<LinkedIssuesField cloudId="c1" projectKey="PROJ" value={[]} onChange={onChange} />);
    await user.type(screen.getByRole("combobox"), "add");
    await waitFor(() => screen.getByText("ABC-1"));
    await user.click(screen.getByText("ABC-1"));
    expect(onChange).toHaveBeenCalledWith([
      { key: "ABC-1", title: "Add export", linkTypeId: "10000" },
    ]);
  });

  it("prevents adding the same (key, linkTypeId) twice", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <LinkedIssuesField
        cloudId="c1"
        projectKey="PROJ"
        value={[{ key: "ABC-1", title: "Add export", linkTypeId: "10000" }]}
        onChange={onChange}
      />,
    );
    await user.type(screen.getByRole("combobox"), "add");
    await waitFor(() => screen.getByText("ABC-1"));
    await user.click(screen.getByText("ABC-1"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("allows changing a chip's link type via the dropdown", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <LinkedIssuesField
        cloudId="c1"
        projectKey="PROJ"
        value={[{ key: "ABC-1", title: "Add export", linkTypeId: "10000" }]}
        onChange={onChange}
      />,
    );
    const select = screen.getByLabelText("Link type for ABC-1");
    await user.selectOptions(select, "10001");
    expect(onChange).toHaveBeenCalledWith([
      { key: "ABC-1", title: "Add export", linkTypeId: "10001" },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- LinkedIssuesField`
Expected: FAIL.

- [ ] **Step 3: Create `components/jira-metadata/LinkedIssuesField.tsx`**

```tsx
"use client";

import { useId, useState } from "react";
import { useIssueSearch, useLinkTypes } from "./hooks";
import type { JiraLinkedIssue } from "@/lib/jira/metadata";

type Props = {
  cloudId: string | null;
  projectKey: string | null;
  value: JiraLinkedIssue[];
  onChange: (next: JiraLinkedIssue[]) => void;
  disabled?: boolean;
};

export function LinkedIssuesField({ cloudId, projectKey, value, onChange, disabled }: Props) {
  const [q, setQ] = useState("");
  const listboxId = useId();
  const issues = useIssueSearch(cloudId, projectKey, q);
  const types = useLinkTypes(cloudId);

  const defaultLinkId = types.data?.find((t) => /^relates$/i.test(t.name))?.id ?? types.data?.[0]?.id ?? "";

  function add(key: string, title: string) {
    if (!defaultLinkId) return;
    const exists = value.some((v) => v.key === key && v.linkTypeId === defaultLinkId);
    if (exists) return;
    onChange([...value, { key, title, linkTypeId: defaultLinkId }]);
    setQ("");
  }
  function remove(key: string, linkTypeId: string) {
    onChange(value.filter((v) => !(v.key === key && v.linkTypeId === linkTypeId)));
  }
  function setLinkType(key: string, oldType: string, newType: string) {
    onChange(value.map((v) =>
      v.key === key && v.linkTypeId === oldType ? { ...v, linkTypeId: newType } : v,
    ));
  }

  return (
    <div className="flex flex-col gap-1.5" data-field="linkedIssues">
      <label className="text-hig-subhead font-medium text-ink">Linked issues</label>
      <div className="flex flex-col gap-1">
        {value.map((v) => (
          <div key={`${v.key}::${v.linkTypeId}`} className="flex items-center gap-2 rounded-sm bg-surface-muted px-2 py-1">
            <span className="font-mono text-hig-footnote">{v.key}</span>
            <select
              aria-label={`Link type for ${v.key}`}
              value={v.linkTypeId}
              onChange={(e) => setLinkType(v.key, v.linkTypeId, e.target.value)}
              disabled={disabled}
              className="text-hig-footnote bg-transparent border border-rule rounded-sm px-1"
            >
              {(types.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>{t.outward}</option>
              ))}
            </select>
            <span className="flex-1 truncate text-hig-footnote text-ink-secondary">{v.title}</span>
            <button
              type="button"
              aria-label={`Remove ${v.key}`}
              onClick={() => remove(v.key, v.linkTypeId)}
              disabled={disabled}
              className="opacity-60 hover:opacity-100"
            >×</button>
          </div>
        ))}
      </div>
      <input
        role="combobox"
        aria-expanded={q.trim().length >= 2}
        aria-controls={listboxId}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        disabled={disabled}
        placeholder="Type a key (ABC-123) or a title fragment…"
        className="h-10 px-3 rounded-md bg-surface border border-rule text-hig-body focus:outline-none focus:border-accent focus:shadow-focus"
      />
      {q.trim().length >= 2 && (
        <ul id={listboxId} role="listbox" className="rounded-md border border-rule bg-surface divide-y divide-rule">
          {issues.loading && <li className="px-3 py-1.5 text-hig-footnote text-ink-secondary">Searching…</li>}
          {issues.error && (
            <li className="px-3 py-1.5 text-hig-footnote text-danger flex items-center gap-2">
              <span>Couldn’t search issues.</span>
              <button type="button" onClick={issues.retry} className="underline">Retry</button>
            </li>
          )}
          {!issues.loading && !issues.error && (issues.data ?? []).map((i) => (
            <li key={i.key}>
              <button
                type="button"
                onClick={() => add(i.key, i.title)}
                className="w-full text-left px-3 py-1.5 text-hig-footnote hover:bg-surface-muted flex items-center gap-3"
              >
                <span className="font-mono">{i.key}</span>
                <span className="text-ink-secondary truncate">{i.title}</span>
              </button>
            </li>
          ))}
          {!issues.loading && !issues.error && (issues.data ?? []).length === 0 && (
            <li className="px-3 py-1.5 text-hig-footnote text-ink-secondary">No issues match.</li>
          )}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test -- LinkedIssuesField`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add components/jira-metadata/LinkedIssuesField.tsx tests/components/jira-metadata/LinkedIssuesField.test.tsx
git commit -m "feat(AI-35): LinkedIssuesField component"
```

---

### Task 16: `FlagField` + `FlagReasonModal`

**Files:**
- Create: `components/jira-metadata/FlagField.tsx`
- Create: `components/jira-metadata/FlagReasonModal.tsx`
- Create: `tests/components/jira-metadata/FlagField.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/jira-metadata/FlagField.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FlagField } from "@/components/jira-metadata/FlagField";

describe("FlagField", () => {
  it("toggles open a reason modal that requires 3+ chars", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FlagField value={{ flagged: false }} onChange={onChange} />);
    await user.click(screen.getByRole("switch", { name: /flag/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    const textarea = screen.getByLabelText(/reason/i);
    const confirm = screen.getByRole("button", { name: /confirm/i });
    expect(confirm).toBeDisabled();

    await user.type(textarea, "ok");
    expect(confirm).toBeDisabled();
    await user.type(textarea, "k");
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(onChange).toHaveBeenCalledWith({ flagged: true, flagReason: "okk" });
  });

  it("Escape cancels the modal and leaves flagged=false", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FlagField value={{ flagged: false }} onChange={onChange} />);
    await user.click(screen.getByRole("switch", { name: /flag/i }));
    await user.keyboard("{Escape}");
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("clearing the flag also clears the reason", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FlagField value={{ flagged: true, flagReason: "x".repeat(5) }} onChange={onChange} />);
    await user.click(screen.getByRole("switch", { name: /flag/i }));
    expect(onChange).toHaveBeenCalledWith({ flagged: false });
  });

  it("View reason re-opens the reason as read-only", async () => {
    const user = userEvent.setup();
    render(<FlagField value={{ flagged: true, flagReason: "blocked on auth" }} onChange={() => {}} />);
    await user.click(screen.getByRole("button", { name: /view reason/i }));
    expect(screen.getByText("blocked on auth")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- FlagField`
Expected: FAIL.

- [ ] **Step 3: Create `components/jira-metadata/FlagReasonModal.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { isValidFlagReason } from "@/lib/jira/metadata";

type Props = {
  initial?: string;
  readOnly?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
};

export function FlagReasonModal({ initial = "", readOnly = false, onConfirm, onCancel }: Props) {
  const [val, setVal] = useState(initial);
  const dialogRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textRef.current?.focus();
  }, []);

  // Focus trap — keep Tab cycling inside the dialog.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter" && !e.shiftKey && !readOnly && isValidFlagReason(val)) {
        e.preventDefault();
        onConfirm(val.trim());
      } else if (e.key === "Tab") {
        const root = dialogRef.current;
        if (!root) return;
        const focusables = root.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const list = Array.from(focusables).filter((el) => !el.hasAttribute("disabled"));
        if (list.length === 0) return;
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [val, onCancel, onConfirm, readOnly]);

  const valid = isValidFlagReason(val);

  return (
    <div role="dialog" aria-modal="true" aria-label="Flag reason" ref={dialogRef} className="fixed inset-0 flex items-center justify-center bg-black/30 z-50">
      <div className="bg-surface border border-rule rounded-md p-5 w-[min(28rem,92vw)] flex flex-col gap-3">
        <header><h3 className="text-hig-title3">{readOnly ? "Flag reason" : "Set flag reason"}</h3></header>
        <label className="flex flex-col gap-1.5">
          <span className="text-hig-subhead">Reason</span>
          {readOnly
            ? <p className="text-hig-body whitespace-pre-wrap break-words rounded-md bg-surface-muted px-3 py-2">{initial}</p>
            : <textarea
                ref={textRef}
                value={val}
                onChange={(e) => setVal(e.target.value)}
                rows={4}
                aria-describedby="flag-reason-help"
                className="rounded-md border border-rule bg-surface px-3 py-2 text-hig-body focus:outline-none focus:border-accent focus:shadow-focus"
              />}
          <span id="flag-reason-help" className="text-hig-footnote text-ink-secondary">
            3–500 characters.
          </span>
        </label>
        <footer className="flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel} className="px-3 py-1.5 text-hig-subhead rounded-md hover:bg-surface-muted">
            {readOnly ? "Close" : "Cancel"}
          </button>
          {!readOnly && (
            <button
              type="button"
              onClick={() => onConfirm(val.trim())}
              disabled={!valid}
              className="px-3 py-1.5 text-hig-subhead bg-accent text-on-accent rounded-md disabled:opacity-50"
            >Confirm</button>
          )}
        </footer>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `components/jira-metadata/FlagField.tsx`**

```tsx
"use client";

import { useState } from "react";
import { FlagReasonModal } from "./FlagReasonModal";

type Value = { flagged: false } | { flagged: true; flagReason: string };

type Props = {
  value: Value;
  onChange: (next: Value) => void;
  disabled?: boolean;
};

export function FlagField({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState<null | "edit" | "view">(null);

  function onToggle() {
    if (value.flagged) {
      onChange({ flagged: false });
    } else {
      setOpen("edit");
    }
  }

  return (
    <div className="flex flex-col gap-1.5" data-field="flag">
      <label className="text-hig-subhead font-medium text-ink">Flag</label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={value.flagged}
          aria-label="Flag this task"
          onClick={onToggle}
          disabled={disabled}
          className={
            "px-3 py-1.5 rounded-md text-hig-subhead border " +
            (value.flagged ? "bg-warn-tint text-warn border-warn" : "border-rule")
          }
        >{value.flagged ? "⚑ Flagged" : "Set flag"}</button>
        {value.flagged && (
          <button
            type="button"
            onClick={() => setOpen("view")}
            className="text-hig-footnote underline text-ink-secondary"
          >View reason</button>
        )}
      </div>
      {open === "edit" && (
        <FlagReasonModal
          onConfirm={(reason) => { setOpen(null); onChange({ flagged: true, flagReason: reason }); }}
          onCancel={() => setOpen(null)}
        />
      )}
      {open === "view" && value.flagged && (
        <FlagReasonModal
          initial={value.flagReason}
          readOnly
          onConfirm={() => setOpen(null)}
          onCancel={() => setOpen(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run tests**

Run: `npm run test -- FlagField`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add components/jira-metadata/FlagField.tsx components/jira-metadata/FlagReasonModal.tsx tests/components/jira-metadata/FlagField.test.tsx
git commit -m "feat(AI-35): FlagField with required-reason modal"
```

---

### Task 17: `EpicField` component

**Files:**
- Create: `components/jira-metadata/EpicField.tsx`
- Create: `tests/components/jira-metadata/EpicField.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/jira-metadata/EpicField.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EpicField } from "@/components/jira-metadata/EpicField";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ epics: [{ key: "EPIC-9", title: "Auth rework" }] }), { status: 200 }),
  );
});

describe("EpicField", () => {
  it("lists open epics for the project", async () => {
    render(<EpicField cloudId="c1" projectKey="PROJ" value={undefined} onChange={() => {}} />);
    await waitFor(() => expect(screen.getByText("Auth rework")).toBeInTheDocument());
  });

  it("selects an existing epic", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<EpicField cloudId="c1" projectKey="PROJ" value={undefined} onChange={onChange} />);
    await waitFor(() => screen.getByText("Auth rework"));
    await user.click(screen.getByText("Auth rework"));
    expect(onChange).toHaveBeenCalledWith({ kind: "existing", key: "EPIC-9", title: "Auth rework" });
  });

  it("opens an inline create row and emits kind:new on commit", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<EpicField cloudId="c1" projectKey="PROJ" value={undefined} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /create new epic/i }));
    await user.type(screen.getByLabelText(/new epic title/i), "Reporting v2");
    await user.click(screen.getByRole("button", { name: /^create$/i }));
    expect(onChange).toHaveBeenCalledWith({ kind: "new", title: "Reporting v2" });
  });

  it("shows the selected existing epic as the picked value", () => {
    render(<EpicField cloudId="c1" projectKey="PROJ" value={{ kind: "existing", key: "EPIC-9", title: "Auth rework" }} onChange={() => {}} />);
    expect(screen.getByText(/EPIC-9 — Auth rework/)).toBeInTheDocument();
  });

  it("shows the selected new-epic title as a draft chip", () => {
    render(<EpicField cloudId="c1" projectKey="PROJ" value={{ kind: "new", title: "Reporting v2" }} onChange={() => {}} />);
    expect(screen.getByText(/New: Reporting v2/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- EpicField`
Expected: FAIL.

- [ ] **Step 3: Create `components/jira-metadata/EpicField.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useEpics } from "./hooks";
import type { JiraEpicRef } from "@/lib/jira/metadata";

type Props = {
  cloudId: string | null;
  projectKey: string | null;
  value: JiraEpicRef | undefined;
  onChange: (next: JiraEpicRef | undefined) => void;
  disabled?: boolean;
};

export function EpicField({ cloudId, projectKey, value, onChange, disabled }: Props) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const epics = useEpics(cloudId, projectKey);

  return (
    <div className="flex flex-col gap-1.5" data-field="epic">
      <label className="text-hig-subhead font-medium text-ink">Epic</label>
      {value?.kind === "existing" && (
        <div className="flex items-center gap-2 rounded-sm bg-surface-muted px-2 py-1 text-hig-footnote">
          <span>{`${value.key} — ${value.title}`}</span>
          <button type="button" aria-label="Clear epic" onClick={() => onChange(undefined)} className="ml-auto opacity-60 hover:opacity-100">×</button>
        </div>
      )}
      {value?.kind === "new" && (
        <div className="flex items-center gap-2 rounded-sm bg-accent-tint px-2 py-1 text-hig-footnote">
          <span>{`New: ${value.title}`}</span>
          <button type="button" aria-label="Clear new epic" onClick={() => onChange(undefined)} className="ml-auto opacity-60 hover:opacity-100">×</button>
        </div>
      )}
      {!value && (
        <>
          {epics.loading && <span className="text-hig-footnote text-ink-secondary">Loading epics…</span>}
          {epics.error && (
            <span className="text-hig-footnote text-danger flex items-center gap-2">
              Couldn’t load epics.
              <button type="button" onClick={epics.retry} className="underline">Retry</button>
            </span>
          )}
          {!epics.loading && !epics.error && (
            <ul className="rounded-md border border-rule bg-surface divide-y divide-rule max-h-48 overflow-auto">
              {(epics.data ?? []).map((e) => (
                <li key={e.key}>
                  <button
                    type="button"
                    onClick={() => onChange({ kind: "existing", key: e.key, title: e.title })}
                    className="w-full text-left px-3 py-1.5 text-hig-footnote hover:bg-surface-muted flex items-center gap-3"
                  >
                    <span className="font-mono">{e.key}</span>
                    <span className="truncate">{e.title}</span>
                  </button>
                </li>
              ))}
              {(epics.data ?? []).length === 0 && (
                <li className="px-3 py-1.5 text-hig-footnote text-ink-secondary">No open epics in this project — create one below.</li>
              )}
            </ul>
          )}
          {!creating && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              disabled={disabled || !projectKey}
              className="self-start text-hig-footnote underline"
            >Create new epic</button>
          )}
          {creating && (
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="new-epic-title">New epic title</label>
              <input
                id="new-epic-title"
                aria-label="New epic title"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="New epic title…"
                className="flex-1 h-10 px-3 rounded-md bg-surface border border-rule text-hig-body focus:outline-none focus:border-accent focus:shadow-focus"
              />
              <button
                type="button"
                onClick={() => { if (draft.trim()) onChange({ kind: "new", title: draft.trim() }); setCreating(false); setDraft(""); }}
                disabled={!draft.trim()}
                className="px-3 py-1.5 text-hig-subhead bg-accent text-on-accent rounded-md disabled:opacity-50"
              >Create</button>
              <button type="button" onClick={() => { setCreating(false); setDraft(""); }} className="px-3 py-1.5 text-hig-subhead rounded-md hover:bg-surface-muted">Cancel</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test -- EpicField`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add components/jira-metadata/EpicField.tsx tests/components/jira-metadata/EpicField.test.tsx
git commit -m "feat(AI-35): EpicField with inline create-new-epic"
```

---

### Task 18: `AttachmentsField` + browser upload helper

**Files:**
- Create: `lib/jira/upload-client.ts`
- Create: `components/jira-metadata/AttachmentsField.tsx`
- Create: `tests/components/jira-metadata/AttachmentsField.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/jira-metadata/AttachmentsField.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AttachmentsField } from "@/components/jira-metadata/AttachmentsField";

function makeFile(name: string, sizeBytes: number, type = "text/plain"): File {
  const f = new File([new Uint8Array(sizeBytes)], name, { type });
  Object.defineProperty(f, "size", { value: sizeBytes });
  return f;
}

describe("AttachmentsField", () => {
  it("accepts files and lists them with name + size", () => {
    const onChange = vi.fn();
    render(<AttachmentsField value={[]} onChange={onChange} maxBytes={1024 * 1024} />);
    fireEvent.change(screen.getByLabelText(/choose files/i), {
      target: { files: [makeFile("a.txt", 100)] },
    });
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0][0];
    expect(next[0].file.name).toBe("a.txt");
  });

  it("rejects oversized files with an inline message naming the file", () => {
    const onChange = vi.fn();
    render(<AttachmentsField value={[]} onChange={onChange} maxBytes={500} />);
    fireEvent.change(screen.getByLabelText(/choose files/i), {
      target: { files: [makeFile("big.bin", 1000), makeFile("ok.txt", 100)] },
    });
    expect(screen.getByText(/File too large.*big.bin/i)).toBeInTheDocument();
    const next = onChange.mock.calls[0][0];
    expect(next.map((a: any) => a.file.name)).toEqual(["ok.txt"]);
  });

  it("removes a row via the remove control", async () => {
    const onChange = vi.fn();
    const existing = [{ id: "1", file: makeFile("a.txt", 100) }];
    render(<AttachmentsField value={existing} onChange={onChange} maxBytes={1024 * 1024} />);
    fireEvent.click(screen.getByLabelText("Remove a.txt"));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- AttachmentsField`
Expected: FAIL.

- [ ] **Step 3: Create `lib/jira/upload-client.ts`**

```ts
"use client";

export function uploadDraftAttachment(args: {
  cloudId: string;
  issueKey: string;
  file: File;
  onProgress?: (pct: number) => void;
  signal?: AbortSignal;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/jira/export-attachments");
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && args.onProgress) args.onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(new Error("network error"));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else {
        let msg = `upload failed (${xhr.status})`;
        try {
          const parsed = JSON.parse(xhr.responseText);
          if (typeof parsed.error === "string") msg = parsed.error;
        } catch { /* not JSON, fine */ }
        reject(new Error(msg));
      }
    };
    if (args.signal) args.signal.addEventListener("abort", () => xhr.abort());
    const form = new FormData();
    form.append("cloudId", args.cloudId);
    form.append("issueKey", args.issueKey);
    form.append("file", args.file);
    xhr.send(form);
  });
}
```

- [ ] **Step 4: Create `components/jira-metadata/AttachmentsField.tsx`**

```tsx
"use client";

import { useId, useRef, useState } from "react";
import type { JiraDraftAttachment } from "@/lib/jira/metadata";
import { MAX_DRAFT_ATTACHMENT_BYTES_DEFAULT } from "@/lib/jira/metadata";

type Props = {
  value: JiraDraftAttachment[];
  onChange: (next: JiraDraftAttachment[]) => void;
  maxBytes?: number;
  disabled?: boolean;
};

function humanSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

let attachmentSeq = 0;

export function AttachmentsField({ value, onChange, maxBytes = MAX_DRAFT_ATTACHMENT_BYTES_DEFAULT, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [tooLarge, setTooLarge] = useState<string[]>([]);

  function accept(files: FileList | File[]) {
    const ok: JiraDraftAttachment[] = [];
    const bad: string[] = [];
    for (const f of Array.from(files)) {
      if (f.size > maxBytes) bad.push(f.name);
      else ok.push({ id: `att-${++attachmentSeq}`, file: f });
    }
    setTooLarge(bad);
    if (ok.length) onChange([...value, ...ok]);
  }

  function remove(id: string, name: string) {
    onChange(value.filter((v) => v.id !== id));
    setTooLarge((cur) => cur.filter((n) => n !== name));
  }

  return (
    <div className="flex flex-col gap-1.5" data-field="attachments">
      <label className="text-hig-subhead font-medium text-ink" htmlFor={inputId}>Attachments</label>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); inputRef.current?.click(); } }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) accept(e.dataTransfer.files); }}
        className="rounded-md border border-dashed border-rule bg-surface-muted px-3 py-4 text-hig-footnote text-ink-secondary text-center cursor-pointer"
      >
        {value.length === 0 ? "Drop files here or click to browse" : "Add more files…"}
      </div>
      <input
        id={inputId}
        ref={inputRef}
        aria-label="Choose files"
        type="file"
        multiple
        onChange={(e) => { if (e.target.files) { accept(e.target.files); e.target.value = ""; } }}
        disabled={disabled}
        className="sr-only"
      />
      {tooLarge.length > 0 && (
        <ul className="text-hig-footnote text-danger">
          {tooLarge.map((n) => (
            <li key={n}>File too large (max {humanSize(maxBytes)}): {n}</li>
          ))}
        </ul>
      )}
      {value.length > 0 && (
        <ul className="rounded-md border border-rule bg-surface divide-y divide-rule">
          {value.map((a) => (
            <li key={a.id} className="px-3 py-1.5 flex items-center gap-3 text-hig-footnote">
              <span className="flex-1 truncate">{a.file.name}</span>
              <span className="text-ink-secondary">{humanSize(a.file.size)}</span>
              <button type="button" aria-label={`Remove ${a.file.name}`} onClick={() => remove(a.id, a.file.name)} className="opacity-60 hover:opacity-100">×</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run tests**

Run: `npm run test -- AttachmentsField`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/jira/upload-client.ts components/jira-metadata/AttachmentsField.tsx tests/components/jira-metadata/AttachmentsField.test.tsx
git commit -m "feat(AI-35): AttachmentsField with size validation and browser upload helper"
```

---

### Task 19: `JiraMetadata` container

**Files:**
- Create: `components/jira-metadata/JiraMetadata.tsx`
- Create: `tests/components/jira-metadata/JiraMetadata.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/jira-metadata/JiraMetadata.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { JiraMetadata } from "@/components/jira-metadata/JiraMetadata";
import { EMPTY_METADATA } from "@/lib/jira/metadata";

vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));

describe("JiraMetadata", () => {
  it("renders all five field groups", () => {
    render(<JiraMetadata cloudId="c1" projectKey="PROJ" value={EMPTY_METADATA} onChange={() => {}} />);
    expect(screen.getByText("Labels")).toBeInTheDocument();
    expect(screen.getByText("Linked issues")).toBeInTheDocument();
    expect(screen.getByText("Attachments")).toBeInTheDocument();
    expect(screen.getByText("Flag")).toBeInTheDocument();
    expect(screen.getByText("Epic")).toBeInTheDocument();
  });

  it("renders a muted hint when no project is selected", () => {
    render(<JiraMetadata cloudId={null} projectKey={null} value={EMPTY_METADATA} onChange={() => {}} />);
    expect(screen.queryByText("Labels")).toBeNull();
    expect(screen.getByText(/pick a project/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- JiraMetadata`
Expected: FAIL.

- [ ] **Step 3: Create `components/jira-metadata/JiraMetadata.tsx`**

```tsx
"use client";

import { useEffect, useRef } from "react";
import type { JiraMetadata as JiraMetadataValue } from "@/lib/jira/metadata";
import { LabelsField } from "./LabelsField";
import { LinkedIssuesField } from "./LinkedIssuesField";
import { AttachmentsField } from "./AttachmentsField";
import { FlagField } from "./FlagField";
import { EpicField } from "./EpicField";

type Props = {
  cloudId: string | null;
  projectKey: string | null;
  issueTypeId?: string | null;
  value: JiraMetadataValue;
  onChange: (next: JiraMetadataValue) => void;
  maxAttachmentBytes?: number;
  disabled?: boolean;
};

export function JiraMetadata({
  cloudId, projectKey, value, onChange, maxAttachmentBytes, disabled,
}: Props) {
  // When project changes, clear labels + epic. Labels search is keyed off
  // cloudId only, but selected labels often don't make sense across projects;
  // epics are strictly per-project.
  const prevProject = useRef<string | null>(projectKey);
  useEffect(() => {
    if (prevProject.current !== null && prevProject.current !== projectKey) {
      onChange({ ...value, labels: [], epic: undefined });
    }
    prevProject.current = projectKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectKey]);

  if (!cloudId || !projectKey) {
    return (
      <p className="text-hig-footnote text-ink-secondary">
        Pick a project to add labels, linked issues, attachments, a flag, or an epic.
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-4 border-t border-rule pt-4 mt-2" aria-label="Jira metadata">
      <LabelsField
        cloudId={cloudId}
        value={value.labels}
        onChange={(labels) => onChange({ ...value, labels })}
        disabled={disabled}
      />
      <LinkedIssuesField
        cloudId={cloudId}
        projectKey={projectKey}
        value={value.linkedIssues}
        onChange={(linkedIssues) => onChange({ ...value, linkedIssues })}
        disabled={disabled}
      />
      <AttachmentsField
        value={value.attachments}
        onChange={(attachments) => onChange({ ...value, attachments })}
        maxBytes={maxAttachmentBytes}
        disabled={disabled}
      />
      <FlagField
        value={value.flagged ? { flagged: true, flagReason: value.flagReason ?? "" } : { flagged: false }}
        onChange={(next) => onChange(
          next.flagged
            ? { ...value, flagged: true, flagReason: next.flagReason }
            : { ...value, flagged: false, flagReason: undefined },
        )}
        disabled={disabled}
      />
      <EpicField
        cloudId={cloudId}
        projectKey={projectKey}
        value={value.epic}
        onChange={(epic) => onChange({ ...value, epic })}
        disabled={disabled}
      />
    </section>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test -- JiraMetadata`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add components/jira-metadata/JiraMetadata.tsx tests/components/jira-metadata/JiraMetadata.test.tsx
git commit -m "feat(AI-35): JiraMetadata container wiring all five field components"
```

---

### Task 20: Wire `JiraMetadata` into `JiraExport.tsx`

**Files:**
- Modify: `components/JiraExport.tsx`
- Modify: `app/api/jira/export/route.ts` (no code change needed beyond schema; just confirm metadata passes through)

This is the integration step — no new pure logic, but the component grows. Manually verified end-to-end via the e2e spec in Task 21.

- [ ] **Step 1: Add `JiraMetadata` to the form pane and store its state**

In `components/JiraExport.tsx`, near the existing state hooks:

```tsx
import { JiraMetadata } from "@/components/jira-metadata/JiraMetadata";
import { EMPTY_METADATA, type JiraMetadata as JiraMetadataValue } from "@/lib/jira/metadata";
import { uploadDraftAttachment } from "@/lib/jira/upload-client";

// ... existing useState calls
const [metadata, setMetadata] = useState<JiraMetadataValue>(EMPTY_METADATA);
const [attachmentResults, setAttachmentResults] = useState<Array<{
  name: string; status: "uploading" | "ok" | "failed"; error?: string; pct?: number;
}>>([]);
```

Render below the existing site/project/issue-type block in the form pane:

```tsx
<JiraMetadata
  cloudId={siteId || null}
  projectKey={projectKey || null}
  issueTypeId={issueTypeId || null}
  value={metadata}
  onChange={setMetadata}
  disabled={exporting || !!result}
/>
```

- [ ] **Step 2: Pass metadata in the submit body**

Replace the existing `submit()` body block with one that includes `metadata` (omit attachments; they go via the separate route after createIssue returns):

```tsx
const body = {
  cloudId: siteId,
  projectKey,
  issueTypeId,
  payload: { story: payload.story, markdown: payload.markdown, constraints: undefined },
  diagrams: diagrams && Object.fromEntries(Object.entries(diagrams).filter(([, v]) => v && v.trim())),
  metadata: {
    labels: metadata.labels.length ? metadata.labels : undefined,
    linkedIssues: metadata.linkedIssues.length
      ? metadata.linkedIssues.map((l) => ({ key: l.key, linkTypeId: l.linkTypeId }))
      : undefined,
    flagged: metadata.flagged || undefined,
    flagReason: metadata.flagged ? metadata.flagReason : undefined,
    epic: metadata.epic,
  },
};
const res = await fetch("/api/jira/export", {
  method: "POST",
  headers: { "content-type": "application/json" },
  credentials: "same-origin",
  body: JSON.stringify(body),
});
```

After `setResult(json as ExportResult)` succeeds and metadata.attachments.length > 0:

```tsx
const issueKey = (json as ExportResult).key;
const initial = metadata.attachments.map((a) => ({ name: a.file.name, status: "uploading" as const, pct: 0 }));
setAttachmentResults(initial);
await Promise.all(metadata.attachments.map(async (a, idx) => {
  try {
    await uploadDraftAttachment({
      cloudId: siteId!,
      issueKey,
      file: a.file,
      onProgress: (pct) =>
        setAttachmentResults((cur) => cur.map((row, i) => i === idx ? { ...row, pct } : row)),
    });
    setAttachmentResults((cur) => cur.map((row, i) => i === idx ? { ...row, status: "ok", pct: 100 } : row));
  } catch (e) {
    setAttachmentResults((cur) => cur.map((row, i) => i === idx ? { ...row, status: "failed", error: e instanceof Error ? e.message : "upload failed" } : row));
  }
}));
```

- [ ] **Step 3: Add a Metadata block to the preview pane**

In the existing preview-pane card, below the markdown <pre> and above the Mermaid attachments list:

```tsx
{(metadata.labels.length > 0 ||
  metadata.linkedIssues.length > 0 ||
  metadata.attachments.length > 0 ||
  metadata.flagged ||
  metadata.epic) && (
  <div className="shrink-0 rounded-md bg-surface-muted p-3 flex flex-col gap-1">
    <p className="text-hig-footnote text-ink-secondary mb-1">Metadata</p>
    {metadata.labels.length > 0 && (
      <p className="text-hig-footnote"><strong>Labels:</strong> {metadata.labels.join(", ")}</p>
    )}
    {metadata.linkedIssues.length > 0 && (
      <p className="text-hig-footnote"><strong>Linked:</strong> {metadata.linkedIssues.map((l) => l.key).join(", ")}</p>
    )}
    {metadata.attachments.length > 0 && (
      <p className="text-hig-footnote"><strong>Attachments:</strong> {metadata.attachments.map((a) => a.file.name).join(", ")}</p>
    )}
    {metadata.flagged && (
      <p className="text-hig-footnote"><strong>Flag:</strong> {metadata.flagReason}</p>
    )}
    {metadata.epic && (
      <p className="text-hig-footnote"><strong>Epic:</strong> {
        metadata.epic.kind === "existing" ? metadata.epic.key : `New: ${metadata.epic.title}`
      }</p>
    )}
  </div>
)}
```

- [ ] **Step 4: Surface attachment upload outcomes in the success view**

In the `if (result)` branch, below the existing diagram attachments block:

```tsx
{attachmentResults.length > 0 && (
  <div className="rounded-md bg-surface-muted p-3">
    <p className="text-hig-footnote text-ink-secondary mb-1">Draft attachments</p>
    <ul className="text-hig-footnote">
      {attachmentResults.map((r) => (
        <li key={r.name}>
          <code>{r.name}</code> —{" "}
          {r.status === "uploading" ? `uploading${typeof r.pct === "number" ? ` (${r.pct}%)` : "…"}` :
           r.status === "ok" ? <span className="text-ink">uploaded</span> :
           <span className="text-danger">failed{r.error ? `: ${r.error}` : ""}</span>}
        </li>
      ))}
    </ul>
  </div>
)}
{result.linkResults && result.linkResults.failed.length > 0 && (
  <div className="rounded-md bg-surface-muted p-3">
    <p className="text-hig-footnote text-ink-secondary mb-1">Linked issues</p>
    <ul className="text-hig-footnote">
      {result.linkResults.failed.map((f) => (
        <li key={f.key} className="text-danger">{f.key}: {f.error}</li>
      ))}
      {result.linkResults.ok.map((k) => (
        <li key={k} className="text-ink">{k} linked</li>
      ))}
    </ul>
  </div>
)}
{result.flagCommentResult === "failed" && (
  <p className="text-hig-footnote text-danger">Flag comment failed: {result.flagCommentError ?? "unknown"}</p>
)}
{result.epicCreated && (
  <p className="text-hig-footnote text-ink-secondary">Epic created: <code>{result.epicCreated.key}</code></p>
)}
```

- [ ] **Step 5: Verify the UI by running the app**

Run: `npm run build && npm run start` (or `npm run dev` with `TASK_AGENT_MODE=stub`).
Manually:
1. Finalize a draft.
2. Open Export → metadata fields should appear once project + issue type are picked.
3. Fill each field; submit; observe attachments uploading and the success view showing the metadata block.

- [ ] **Step 6: Run all unit tests and typecheck**

Run: `npm run test && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add components/JiraExport.tsx
git commit -m "feat(AI-35): wire JiraMetadata into the Jira export sheet"
```

---

### Task 21: Playwright smoke e2e

**Files:**
- Create: `e2e/export-metadata.spec.ts`

- [ ] **Step 1: Write the e2e spec**

```ts
// e2e/export-metadata.spec.ts
import { test, expect } from "@playwright/test";

// Runs with TASK_AGENT_MODE=stub. We stub the Jira routes via Playwright's
// `page.route`, then drive the finalize → export flow.

test("Jira export metadata smoke", async ({ page }) => {
  // Stub Jira REST routes.
  await page.route("**/api/jira/whoami", (r) => r.fulfill({ json: { connected: true, email: "test@labforty.com" } }));
  await page.route("**/api/jira/resources", (r) => r.fulfill({ json: { resources: [{ id: "c1", name: "Site", url: "https://example.atlassian.net" }] } }));
  await page.route("**/api/jira/projects*", (r) => r.fulfill({ json: { projects: [{ id: "1", key: "PROJ", name: "Demo", avatarUrl: null }] } }));
  await page.route("**/api/jira/issue-types*", (r) => r.fulfill({ json: { issueTypes: [{ id: "10001", name: "Story", iconUrl: null, description: null }] } }));
  await page.route("**/api/jira/labels*", (r) => r.fulfill({ json: { labels: ["backend"] } }));
  await page.route("**/api/jira/issue-search*", (r) => r.fulfill({ json: { issues: [{ key: "ABC-1", title: "Add export" }] } }));
  await page.route("**/api/jira/link-types*", (r) => r.fulfill({ json: { linkTypes: [{ id: "10000", name: "Relates", inward: "relates to", outward: "relates to" }] } }));
  await page.route("**/api/jira/epics*", (r) => r.fulfill({ json: { epics: [{ key: "EPIC-9", title: "Auth rework" }] } }));
  await page.route("**/api/jira/export", (r) => r.fulfill({ json: { key: "PROJ-100", url: "https://example.atlassian.net/browse/PROJ-100", attachments: {}, attachmentErrors: {}, autoFilledFields: [], missingRequiredFields: [], linkResults: { ok: ["ABC-1"], failed: [] }, flagCommentResult: "ok" } }));

  await page.goto("/");
  // Finalize a draft (stub mode). Implementation-specific selectors:
  await page.getByLabel("Task title").fill("Smoke task");
  await page.getByRole("button", { name: /finalize task/i }).click();
  await page.getByRole("button", { name: /export to jira/i }).click();

  await page.getByRole("combobox", { name: /labels/i }).fill("ba");
  await page.getByText("backend").click();
  await expect(page.getByText("backend", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /create issue/i }).click();
  await expect(page.getByText("PROJ-100")).toBeVisible();
});
```

- [ ] **Step 2: Run the e2e spec**

Run: `npm run test:e2e -- export-metadata`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add e2e/export-metadata.spec.ts
git commit -m "test(AI-35): playwright smoke for jira export metadata"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task(s) |
|---|---|
| Metadata lives on Export screen | 19, 20 |
| Five field groups: labels, linked issues, attachments, flag, epic | 14, 15, 18, 16, 17 |
| Inline create-new-label affordance | 14 |
| Case-insensitive label duplicate guard | 1, 14 |
| Linked issues typeahead (250ms, ≥2 chars), `key === ...` branch | 4, 13, 15 |
| Per-chip link-type picker | 15 |
| Attachments: file picker, drop zone, size validation, draft lifecycle | 18 |
| Configurable max size | 1 (`readDraftAttachmentMaxBytes`), 12 |
| Flag-with-reason modal, focus trap, Esc cancels, Enter confirms | 16 |
| Epic selector + inline create | 17, 11 |
| Loading/empty/error states + retry | 13 (hooks), 14/15/17 (UI) |
| Saved payload shape | 1 (types), 2 (schema) |
| Labels system field, Epic Link (parent or custom), Flagged system field | 8 (resolution), 9 (route into createIssue) |
| Linked issues via post-create issueLink | 7 (helper), 10 (orchestrator) |
| Flag reason via post-create comment | 7, 10 |
| Inline epic creation pre-step | 11 |
| Backward compatibility (metadata optional) | 2 |
| Accessibility (combobox, focus trap, keyboard nav) | 14, 15, 16, 17, 18 |
| Tests: unit + integration + e2e | 1, 2, 3-12, 13-19, 21 |

**Placeholder scan:** no "TBD" / "TODO" / "add appropriate error handling" patterns. All steps include either complete code or exact run commands.

**Type consistency:** `linkTypeId` (not `linkType`) used consistently across schema, types, components, and orchestrator. `JiraMetadata`/`JiraEpicRef`/`JiraLinkedIssue`/`JiraDraftAttachment` defined once in `lib/jira/metadata.ts` and re-imported everywhere. `findEpicLinkField` / `findFlaggedField` / `findLabelsField` keep stable signatures across tasks 8, 9, 11.

No issues found beyond what was fixed during writing.
