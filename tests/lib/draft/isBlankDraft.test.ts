import { describe, it, expect } from "vitest";
import { EMPTY_DRAFT, isBlankDraft } from "@/lib/draft/autosave";

describe("isBlankDraft", () => {
  it("is true for EMPTY_DRAFT", () => {
    expect(isBlankDraft(EMPTY_DRAFT)).toBe(true);
  });
  it("is false once a title is typed", () => {
    expect(isBlankDraft({ ...EMPTY_DRAFT, title: "X" })).toBe(false);
  });
});
