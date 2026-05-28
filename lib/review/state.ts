import { type ReviewMap, type SubtaskReview, EMPTY_REVIEW } from "./types";

export function getReview(map: ReviewMap, id: string): SubtaskReview {
  return map[id] ?? EMPTY_REVIEW;
}

export function setReview(map: ReviewMap, id: string, patch: Partial<SubtaskReview>): ReviewMap {
  return { ...map, [id]: { ...getReview(map, id), ...patch } };
}

export function initReviews(ids: string[], existing: ReviewMap = {}): ReviewMap {
  const out: ReviewMap = {};
  for (const id of ids) out[id] = existing[id] ?? { ...EMPTY_REVIEW };
  return out;
}

export function pruneReviews(map: ReviewMap, validIds: string[]): ReviewMap {
  const valid = new Set(validIds);
  const out: ReviewMap = {};
  for (const [id, review] of Object.entries(map)) if (valid.has(id)) out[id] = review;
  return out;
}

export function allReviewed(ids: string[], map: ReviewMap): boolean {
  if (ids.length === 0) return false;
  return ids.every((id) => {
    const s = getReview(map, id).status;
    return s === "approved" || s === "denied";
  });
}

// Filter task ids by removing those whose review is marked "denied".
// Missing entries (no review at all) are treated as not-denied so the
// list stays in input order; the gate check (allReviewed) is what
// actually requires every task to be approved or denied.
export function nonDeniedTaskIds(map: ReviewMap, ids: string[]): string[] {
  return ids.filter((id) => map[id]?.status !== "denied");
}
