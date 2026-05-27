import { describe, it, expect } from "vitest";
import { extractJsonObject } from "@/lib/json/extract";

describe("extractJsonObject", () => {
  it("returns the first balanced top-level object", () => {
    expect(extractJsonObject('{"a":1}')).toBe('{"a":1}');
  });
  it("tolerates surrounding prose and fences", () => {
    expect(extractJsonObject("text\n```json\n{\"a\":1}\n```")).toBe('{"a":1}');
  });
  it("ignores braces inside strings", () => {
    expect(extractJsonObject('{"a":"}"}')).toBe('{"a":"}"}');
  });
  it("returns null when there is no object", () => {
    expect(extractJsonObject("nope")).toBeNull();
  });
});
