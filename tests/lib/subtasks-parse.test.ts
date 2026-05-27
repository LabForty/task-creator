import { describe, it, expect } from "vitest";
import { parseSubtasksResponse } from "@/lib/subtasks/parse";

describe("parseSubtasksResponse", () => {
  it("parses a valid subtasks payload with defaults", () => {
    const raw = JSON.stringify({ subtasks: [{ title: "A" }, { title: "B", description: "d", labels: ["x"], blocks: [0] }] });
    const r = parseSubtasksResponse(raw);
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({ title: "A", description: "", labels: [], blocks: [] });
    expect(r[1].blocks).toEqual([0]);
  });

  it("tolerates fences/prose", () => {
    const r = parseSubtasksResponse("here:\n```json\n" + JSON.stringify({ subtasks: [{ title: "A" }] }) + "\n```");
    expect(r).toHaveLength(1);
  });

  it("truncates descriptions to 1500 chars", () => {
    const long = "x".repeat(2000);
    const r = parseSubtasksResponse(JSON.stringify({ subtasks: [{ title: "A", description: long }] }));
    expect(r[0].description).toHaveLength(1500);
  });

  it("drops out-of-range blocks indices", () => {
    const r = parseSubtasksResponse(JSON.stringify({ subtasks: [{ title: "A", blocks: [5, -1, 0] }] }));
    expect(r[0].blocks).toEqual([0]);
  });

  it("caps the number of subtasks at 50", () => {
    const many = Array.from({ length: 70 }, (_, i) => ({ title: `T${i}` }));
    expect(parseSubtasksResponse(JSON.stringify({ subtasks: many }))).toHaveLength(50);
  });

  it("throws when there is no JSON object", () => {
    expect(() => parseSubtasksResponse("nope")).toThrow(/JSON/i);
  });
});
