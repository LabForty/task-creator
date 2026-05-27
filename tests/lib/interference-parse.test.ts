import { describe, it, expect } from "vitest";
import { parseInterferenceResponse } from "@/lib/interference/parse";

describe("parseInterferenceResponse", () => {
  it("parses warnings", () => {
    const r = parseInterferenceResponse(JSON.stringify({ interference: [{ affectedTaskId: "b", reason: "shares the same API" }] }));
    expect(r).toEqual([{ affectedTaskId: "b", reason: "shares the same API" }]);
  });
  it("defaults to empty array when interference is missing", () => {
    expect(parseInterferenceResponse(JSON.stringify({}))).toEqual([]);
  });
  it("tolerates fences/prose", () => {
    const r = parseInterferenceResponse("ok\n```json\n" + JSON.stringify({ interference: [] }) + "\n```");
    expect(r).toEqual([]);
  });
  it("drops malformed warnings (missing reason)", () => {
    const r = parseInterferenceResponse(JSON.stringify({ interference: [{ affectedTaskId: "b" }, { affectedTaskId: "c", reason: "x" }] }));
    expect(r).toEqual([{ affectedTaskId: "c", reason: "x" }]);
  });
  it("throws when no JSON object", () => {
    expect(() => parseInterferenceResponse("nope")).toThrow(/JSON/i);
  });
});
