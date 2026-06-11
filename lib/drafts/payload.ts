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

// Stored payloads can predate the current Draft shape (old app versions,
// corruption). Coerce instead of trusting the type: one bad row must degrade
// to a placeholder, never throw and 500 the whole drafts list.
function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function deriveWorkingTitle(payload: Partial<Draft>): string {
  const t = asString(payload.title).trim();
  if (t) return t;
  if (payload.mode === "epic") {
    const first = Array.isArray(payload.epicTasks)
      ? asString(payload.epicTasks[0]?.title).trim()
      : "";
    return first || "Untitled epic";
  }
  return "Untitled draft";
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PREVIEW_MAX = 140;

export function derivePreview(payload: Partial<Draft>): string {
  if (payload.mode === "epic") {
    const n = Array.isArray(payload.epicTasks) ? payload.epicTasks.length : 0;
    return n === 1 ? "1 task" : `${n} tasks`;
  }
  const text = stripHtml(asString(payload.description));
  if (text.length <= PREVIEW_MAX) return text;
  return text.slice(0, PREVIEW_MAX - 1).trimEnd() + "…";
}
