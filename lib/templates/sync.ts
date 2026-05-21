import { promises as fs } from "node:fs";
import path from "node:path";

// External source of truth for task-type templates. The remote endpoint
// returns one markdown blob per type (bug, story, epic, …). We mirror them
// to disk so a) finalize doesn't take a network hop, b) the app keeps
// working when the workflow service is offline, c) the dev/SSR path can
// inspect files directly.

const REMOTE_URL = "https://workflow.daskalovi.duckdns.org/api/public/prompts/types";
const SECRET_HEADER = "X-Tickforge-Secret";
const SECRET_VALUE = "rawr";

// Daily cadence per the spec. lastSyncedAt is also written by the manual
// /api/templates/sync endpoint.
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export const TEMPLATES_DIR = path.join(process.cwd(), "prompts", "types");
const INDEX_FILE = path.join(TEMPLATES_DIR, "_index.json");

export type TemplateIndex = {
  lastSyncedAt: string | null;          // ISO; null when never synced
  latestModified: string | null;        // mirror of the remote `latest_modified`
  types: Record<string, { modified: string }>;  // per-key remote mtime
};

export type SyncResult = {
  ok: boolean;
  // Why we bailed out without writing anything (only set when ok=false OR
  // when the remote returned nothing meaningful).
  reason?: string;
  // Per-key outcome for the response payload.
  written: string[];
  skipped: { key: string; reason: string }[];
};

// Slugify a remote key into a filesystem-safe filename. The remote keys
// today are kebab/snake (bug, change_request); this is defensive against
// future additions ("uX/design").
function safeSlug(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

function fileForKey(key: string): string {
  return path.join(TEMPLATES_DIR, `${safeSlug(key)}.md`);
}

export async function readIndex(): Promise<TemplateIndex> {
  try {
    const raw = await fs.readFile(INDEX_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<TemplateIndex>;
    return {
      lastSyncedAt: typeof parsed.lastSyncedAt === "string" ? parsed.lastSyncedAt : null,
      latestModified: typeof parsed.latestModified === "string" ? parsed.latestModified : null,
      types: parsed.types && typeof parsed.types === "object" ? parsed.types : {},
    };
  } catch {
    return { lastSyncedAt: null, latestModified: null, types: {} };
  }
}

async function writeIndex(idx: TemplateIndex): Promise<void> {
  await fs.mkdir(TEMPLATES_DIR, { recursive: true });
  await fs.writeFile(INDEX_FILE, JSON.stringify(idx, null, 2) + "\n", "utf8");
}

export function isStale(idx: TemplateIndex, now: number = Date.now()): boolean {
  if (!idx.lastSyncedAt) return true;
  const last = Date.parse(idx.lastSyncedAt);
  if (!Number.isFinite(last)) return true;
  return now - last >= STALE_AFTER_MS;
}

// Fetch the remote payload. Returns null on any non-2xx, network error,
// or invalid shape — callers treat null as "leave existing files alone".
async function fetchRemote(): Promise<{
  latest_modified?: string;
  prompts: Record<string, { content?: string; modified?: string }>;
} | null> {
  try {
    const res = await fetch(REMOTE_URL, {
      method: "GET",
      headers: { [SECRET_HEADER]: SECRET_VALUE, Accept: "application/json" },
      // Don't let upstream caches stall a daily refresh.
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`[templates/sync] remote returned HTTP ${res.status}`);
      return null;
    }
    const json = (await res.json()) as unknown;
    if (!json || typeof json !== "object") return null;
    const obj = json as { prompts?: unknown; latest_modified?: unknown };
    if (!obj.prompts || typeof obj.prompts !== "object") return null;
    return {
      latest_modified:
        typeof obj.latest_modified === "string" ? obj.latest_modified : undefined,
      prompts: obj.prompts as Record<string, { content?: string; modified?: string }>,
    };
  } catch (e) {
    console.warn(`[templates/sync] fetch failed:`, e instanceof Error ? e.message : e);
    return null;
  }
}

export async function runSync(): Promise<SyncResult> {
  const remote = await fetchRemote();
  if (!remote) {
    return {
      ok: false,
      reason: "remote fetch returned nothing usable; existing templates left intact",
      written: [],
      skipped: [],
    };
  }

  const keys = Object.keys(remote.prompts);
  if (keys.length === 0) {
    return {
      ok: false,
      reason: "remote returned an empty prompts object; existing templates left intact",
      written: [],
      skipped: [],
    };
  }

  await fs.mkdir(TEMPLATES_DIR, { recursive: true });
  const idx = await readIndex();
  const written: string[] = [];
  const skipped: { key: string; reason: string }[] = [];

  for (const key of keys) {
    const entry = remote.prompts[key];
    const content = entry?.content;
    if (typeof content !== "string" || content.trim().length === 0) {
      skipped.push({ key, reason: "remote content empty or missing" });
      continue;
    }
    try {
      await fs.writeFile(fileForKey(key), content, "utf8");
      idx.types[key] = { modified: entry.modified ?? new Date().toISOString() };
      written.push(key);
    } catch (e) {
      skipped.push({
        key,
        reason: `write failed: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  idx.lastSyncedAt = new Date().toISOString();
  if (remote.latest_modified) idx.latestModified = remote.latest_modified;
  await writeIndex(idx);

  return { ok: true, written, skipped };
}

// ---------------------------------------------------------------------------
// Read side — UI list + planner lookup.
// ---------------------------------------------------------------------------

export type TemplateRecord = {
  key: string;
  label: string;
  modified: string | null;
};

function humanLabel(key: string): string {
  return key
    .split(/[_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export async function listTemplates(): Promise<TemplateRecord[]> {
  await fs.mkdir(TEMPLATES_DIR, { recursive: true });
  const idx = await readIndex();
  let names: string[];
  try {
    names = await fs.readdir(TEMPLATES_DIR);
  } catch {
    return [];
  }
  return names
    .filter((n) => n.endsWith(".md"))
    .map((n) => n.slice(0, -3))
    .sort()
    .map<TemplateRecord>((key) => ({
      key,
      label: humanLabel(key),
      modified: idx.types[key]?.modified ?? null,
    }));
}

export async function readTemplate(key: string): Promise<string | null> {
  const slug = safeSlug(key);
  if (!slug) return null;
  try {
    return await fs.readFile(path.join(TEMPLATES_DIR, `${slug}.md`), "utf8");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Bootstrap helper used by API routes — kicks off a sync in the background
// if it's been more than 24h. Never throws; the caller continues regardless.
// ---------------------------------------------------------------------------

let inFlightSync: Promise<SyncResult> | null = null;

export async function maybeSyncInBackground(): Promise<void> {
  const idx = await readIndex();
  if (!isStale(idx)) return;
  if (inFlightSync) return;
  inFlightSync = runSync()
    .catch((e) => {
      console.warn("[templates/sync] background sync failed:", e);
      return { ok: false, reason: String(e), written: [], skipped: [] } satisfies SyncResult;
    })
    .finally(() => {
      inFlightSync = null;
    }) as Promise<SyncResult>;
}
