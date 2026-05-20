import { describe, it, expect } from "vitest";
import { buildIssueDescriptionAdf } from "@/lib/jira/adf";
import { inline } from "@/lib/jira/adf";
import type { Story } from "@/lib/pipeline";

const story: Story = {
  title: "Implement /export endpoint",
  userStory: {
    asA: "platform operator",
    iWant: "download the user table as a CSV",
    soThat: "hand it to auditors without writing SQL",
  },
  scope: ["GET /api/users/export"],
  requirements: [
    {
      category: "Endpoint",
      items: ["Add GET /api/users/export returning text/csv", "Stream the body for large tables"],
    },
  ],
  acceptanceCriteria: ["Returns 200 with a CSV body", "Returns 401 with no session"],
  outOfScope: [],
};

describe("lib/jira/adf.inline", () => {
  it("returns a single text node when there is no bold", () => {
    const out = inline("plain text");
    expect(out).toEqual([{ type: "text", text: "plain text" }]);
  });

  it("emits strong marks around **bold** segments", () => {
    const out = inline("a **bold** b");
    expect(out).toEqual([
      { type: "text", text: "a " },
      { type: "text", text: "bold", marks: [{ type: "strong" }] },
      { type: "text", text: " b" },
    ]);
  });

  it("handles multiple bold segments", () => {
    const out = inline("**x** then **y**");
    expect(out.filter((n) => n.marks).length).toBe(2);
  });
});

describe("lib/jira/adf.buildIssueDescriptionAdf", () => {
  it("emits a valid ADF doc shape", () => {
    const adf = buildIssueDescriptionAdf({ story });
    expect(adf.version).toBe(1);
    expect(adf.type).toBe("doc");
    expect(Array.isArray(adf.content)).toBe(true);
  });

  it("includes the user-story paragraph with strong marks on the connectors", () => {
    const adf = buildIssueDescriptionAdf({ story });
    const first = adf.content[0];
    expect(first.type).toBe("paragraph");
    if (first.type !== "paragraph") throw new Error("expected paragraph");
    const strongs = first.content.filter((n) => n.marks?.some((m) => m.type === "strong"));
    expect(strongs.length).toBe(3);
    expect(strongs.map((s) => s.text)).toEqual(["As a ", ", I want to ", ", so I can "]);
  });

  it("emits Scope / Requirements / Acceptance criteria section headings", () => {
    const adf = buildIssueDescriptionAdf({ story });
    const headings = adf.content
      .filter((b): b is { type: "heading"; attrs: { level: 1 | 2 | 3 | 4 | 5 | 6 }; content: { type: "text"; text: string }[] } => b.type === "heading")
      .map((h) => ({ level: h.attrs.level, text: h.content.map((c) => c.text).join("") }));
    expect(headings).toEqual(
      expect.arrayContaining([
        { level: 2, text: "Scope" },
        { level: 2, text: "Requirements" },
        { level: 2, text: "Acceptance criteria" },
      ]),
    );
  });

  it("omits Scope when story has no scope", () => {
    const adf = buildIssueDescriptionAdf({ story: { ...story, scope: [] } });
    const has = adf.content.some(
      (b) => b.type === "heading" && b.content[0]?.text === "Scope",
    );
    expect(has).toBe(false);
  });

  it("renders requirements as nested bullets grouped by category", () => {
    const adf = buildIssueDescriptionAdf({ story });
    const reqIdx = adf.content.findIndex(
      (b) => b.type === "heading" && b.content[0]?.text === "Requirements",
    );
    expect(reqIdx).toBeGreaterThan(-1);
    const list = adf.content[reqIdx + 1];
    expect(list.type).toBe("bulletList");
  });

  it("renders acceptance criteria as flat bullets", () => {
    const adf = buildIssueDescriptionAdf({ story });
    const acIdx = adf.content.findIndex(
      (b) => b.type === "heading" && b.content[0]?.text === "Acceptance criteria",
    );
    expect(acIdx).toBeGreaterThan(-1);
    const list = adf.content[acIdx + 1];
    expect(list.type).toBe("bulletList");
  });

  it("includes Out of scope when populated", () => {
    const adf = buildIssueDescriptionAdf({
      story: { ...story, outOfScope: ["Scheduled exports"] },
    });
    const has = adf.content.some(
      (b) => b.type === "heading" && b.content[0]?.text === "Out of scope",
    );
    expect(has).toBe(true);
  });

  it("omits Out of scope when empty", () => {
    const adf = buildIssueDescriptionAdf({ story });
    const has = adf.content.some(
      (b) => b.type === "heading" && b.content[0]?.text === "Out of scope",
    );
    expect(has).toBe(false);
  });

  it("includes Notes when constraints are supplied", () => {
    const adf = buildIssueDescriptionAdf({ story, constraints: "Use the existing auth middleware." });
    const has = adf.content.some(
      (b) => b.type === "heading" && b.content[0]?.text === "Notes",
    );
    expect(has).toBe(true);
  });

  it("omits Acceptance criteria section when includeAcceptanceCriteria is false", () => {
    const adf = buildIssueDescriptionAdf({ story, includeAcceptanceCriteria: false });
    const hasAcHeading = adf.content.some(
      (b) => b.type === "heading" && b.content[0]?.text === "Acceptance criteria",
    );
    expect(hasAcHeading).toBe(false);
  });
});
