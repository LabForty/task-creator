import { describe, it, expect } from "vitest";
import { deriveWorkingTitle, stripHtml, derivePreview } from "./payload";

describe("deriveWorkingTitle", () => {
  it("uses a trimmed title when present", () => {
    expect(deriveWorkingTitle({ title: "  Export users  " })).toBe("Export users");
  });
  it("falls back to 'Untitled draft' when empty/missing", () => {
    expect(deriveWorkingTitle({ title: "   " })).toBe("Untitled draft");
    expect(deriveWorkingTitle({})).toBe("Untitled draft");
  });
});

describe("stripHtml", () => {
  it("removes tags and collapses whitespace", () => {
    expect(stripHtml("<p>Hello <b>world</b></p>\n<p>again</p>")).toBe("Hello world again");
  });
});

describe("derivePreview", () => {
  it("strips HTML and truncates to 140 chars with an ellipsis", () => {
    const long = "<p>" + "a".repeat(300) + "</p>";
    const preview = derivePreview({ description: long });
    expect(preview.length).toBeLessThanOrEqual(140);
    expect(preview.endsWith("…")).toBe(true);
  });
  it("returns short text unchanged", () => {
    expect(derivePreview({ description: "<p>short</p>" })).toBe("short");
    expect(derivePreview({})).toBe("");
  });
});
