import { describe, it, expect } from "vitest";
import { EMPTY_DRAFT } from "@/lib/draft/autosave";
import { readinessScore } from "@/lib/draft/readiness";

describe("readinessScore", () => {
  it("is 0 for an empty draft", () => {
    expect(readinessScore(EMPTY_DRAFT)).toBe(0);
  });
  it("counts title, sufficient description, and >=1 acceptance criterion", () => {
    const d = {
      ...EMPTY_DRAFT,
      title: "Export users",
      description: "x".repeat(40),
      acceptanceCriteria: ["Given a user list, a CSV downloads"],
    };
    expect(readinessScore(d)).toBe(3);
  });
  it("ignores whitespace-only fields", () => {
    expect(readinessScore({ ...EMPTY_DRAFT, title: "   " })).toBe(0);
  });
});
