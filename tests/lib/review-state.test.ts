import { describe, it, expect } from "vitest";
import { getReview, setReview, initReviews, pruneReviews, allReviewed } from "@/lib/review/state";
import { EMPTY_REVIEW, type ReviewMap } from "@/lib/review/types";

describe("review reducer", () => {
  it("getReview returns EMPTY_REVIEW for unknown id", () => {
    expect(getReview({}, "x")).toEqual(EMPTY_REVIEW);
  });
  it("setReview patches one id without touching others", () => {
    const m = setReview({ a: { status: "approved", comment: "", assignee: null } }, "b", { status: "denied" });
    expect(m.a.status).toBe("approved");
    expect(m.b).toEqual({ status: "denied", comment: "", assignee: null });
  });
  it("setReview merges into existing entry", () => {
    let m = setReview({}, "a", { status: "change_requested", comment: "fix" });
    m = setReview(m, "a", { assignee: "sam" });
    expect(m.a).toEqual({ status: "change_requested", comment: "fix", assignee: "sam" });
  });
  it("initReviews adds pending entries for new ids and keeps existing", () => {
    const m = initReviews(["a", "b"], { a: { status: "approved", comment: "", assignee: null } });
    expect(m.a.status).toBe("approved");
    expect(m.b).toEqual(EMPTY_REVIEW);
  });
  it("pruneReviews drops entries not in validIds", () => {
    const m = pruneReviews({ a: EMPTY_REVIEW, b: EMPTY_REVIEW }, ["a"]);
    expect(Object.keys(m)).toEqual(["a"]);
  });
  it("allReviewed is true only when every id is approved or denied", () => {
    const m: ReviewMap = { a: { status: "approved", comment: "", assignee: null }, b: { status: "denied", comment: "", assignee: null } };
    expect(allReviewed(["a", "b"], m)).toBe(true);
    expect(allReviewed(["a", "b"], { ...m, b: EMPTY_REVIEW })).toBe(false);
    expect(allReviewed([], m)).toBe(false);
  });
});
