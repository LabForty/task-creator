import { describe, it, expect } from "vitest";
import { deriveWorkingTitle, stripHtml, derivePreview } from "@/lib/drafts/payload";

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

// AI-50: stored payloads can predate the current Draft shape (old app
// versions, manual edits, corruption). Derivations must degrade, not throw —
// a single bad row must never 500 the whole drafts list.
describe("corrupted payloads degrade instead of throwing", () => {
  it("derivePreview tolerates a non-string description", () => {
    expect(derivePreview({ description: { rich: true } } as never)).toBe("");
  });
  it("deriveWorkingTitle tolerates a non-string title", () => {
    expect(deriveWorkingTitle({ title: 42 } as never)).toBe("Untitled draft");
  });
  it("epic working title tolerates a non-string first-task title", () => {
    expect(
      deriveWorkingTitle({ mode: "epic", epicTasks: [{ id: "t1", title: 7 }] } as never),
    ).toBe("Untitled epic");
  });
  it("epic preview tolerates non-array epicTasks", () => {
    expect(derivePreview({ mode: "epic", epicTasks: {} } as never)).toBe("0 tasks");
  });
});

describe("epic derivations", () => {
  it("working title uses the epic title when present", () => {
    expect(deriveWorkingTitle({ mode: "epic", title: "Checkout revamp" })).toBe("Checkout revamp");
  });
  it("working title falls back to the first task title", () => {
    expect(
      deriveWorkingTitle({ mode: "epic", title: "", epicTasks: [{ id: "t1", title: "Wire API" }] as any }),
    ).toBe("Wire API");
  });
  it("working title falls back to 'Untitled epic' when nothing is set", () => {
    expect(deriveWorkingTitle({ mode: "epic" })).toBe("Untitled epic");
  });
  it("preview shows task count for epics", () => {
    expect(derivePreview({ mode: "epic", epicTasks: [{}, {}, {}] as any })).toBe("3 tasks");
    expect(derivePreview({ mode: "epic", epicTasks: [{}] as any })).toBe("1 task");
    expect(derivePreview({ mode: "epic" })).toBe("0 tasks");
  });
  it("single-mode derivations are unchanged", () => {
    expect(deriveWorkingTitle({ title: "Hello" })).toBe("Hello");
    expect(deriveWorkingTitle({})).toBe("Untitled draft");
    expect(derivePreview({ description: "<p>Hi there</p>" })).toBe("Hi there");
  });
});
