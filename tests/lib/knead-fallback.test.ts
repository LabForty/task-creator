import { describe, it, expect } from "vitest";
import { FALLBACK_FIRST_ROUND } from "@/lib/knead/fallback";
import { KneadQuestionSchema } from "@/lib/knead/parse";

describe("FALLBACK_FIRST_ROUND", () => {
  it("contains at least three questions covering both sections", () => {
    expect(FALLBACK_FIRST_ROUND.length).toBeGreaterThanOrEqual(3);
    const sections = new Set(FALLBACK_FIRST_ROUND.map((q) => q.section));
    expect(sections.has("business")).toBe(true);
    expect(sections.has("technical")).toBe(true);
  });

  it("every question parses under KneadQuestionSchema", () => {
    for (const q of FALLBACK_FIRST_ROUND) {
      expect(() => KneadQuestionSchema.parse(q)).not.toThrow();
    }
  });

  it("every question has a stable kebab-case id", () => {
    for (const q of FALLBACK_FIRST_ROUND) {
      expect(q.id).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });
});
