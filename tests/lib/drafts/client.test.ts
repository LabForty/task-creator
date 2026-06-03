import { describe, it, expect } from "vitest";
import { upsertRequest, deleteDraftRequest } from "@/lib/drafts/client";

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
