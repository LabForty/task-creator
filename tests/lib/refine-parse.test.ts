import { describe, it, expect } from "vitest";
import { parseRefineResponse } from "@/lib/refine/parse";

describe("parseRefineResponse", () => {
  it("parses title/description/acceptanceCriteria", () => {
    const r = parseRefineResponse(JSON.stringify({ title: "T", description: "D", acceptanceCriteria: ["a", "b"] }));
    expect(r).toEqual({ title: "T", description: "D", acceptanceCriteria: ["a", "b"] });
  });
  it("defaults acceptanceCriteria to [] and tolerates fences", () => {
    const r = parseRefineResponse("ok\n```json\n" + JSON.stringify({ title: "T", description: "D" }) + "\n```");
    expect(r.acceptanceCriteria).toEqual([]);
  });
  it("truncates description to 1500", () => {
    const r = parseRefineResponse(JSON.stringify({ title: "T", description: "x".repeat(2000) }));
    expect(r.description).toHaveLength(1500);
  });
  it("throws on no JSON object", () => {
    expect(() => parseRefineResponse("nope")).toThrow(/JSON/i);
  });
});
