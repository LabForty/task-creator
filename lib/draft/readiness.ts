import type { Draft } from "@/lib/draft/autosave";

const MIN_DESCRIPTION = 40; // visible chars

/**
 * Client-side completeness score 0..3 for the editor's readiness hint:
 * (1) title present, (2) description >= MIN_DESCRIPTION visible chars,
 * (3) >= 1 non-empty acceptance criterion. No AI, no network.
 */
export function readinessScore(d: Draft): number {
  let n = 0;
  if (d.title.trim()) n += 1;
  if (d.description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().length >= MIN_DESCRIPTION) n += 1;
  if ((d.acceptanceCriteria ?? []).some((a) => a.trim())) n += 1;
  return n;
}

export const READINESS_MAX = 3;
