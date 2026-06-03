// Pure request descriptors for draft persistence. Encodes the "save updates in
// place, not duplicates" rule: a draft with an id is PATCHed; a new draft is
// POSTed to the collection.
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
