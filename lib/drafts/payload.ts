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
