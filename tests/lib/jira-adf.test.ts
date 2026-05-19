import { describe, it, expect } from "vitest";
import { buildIssueDescriptionAdf } from "@/lib/jira/adf";
import { inline } from "@/lib/jira/adf";
import type { Story } from "@/lib/pipeline";

const story: Story = {
  title: "Implement /export endpoint",
  userStory: {
    asA: "platform operator",
    iWant: "to download the user table as a CSV",
    soThat: "I can hand it to auditors without writing SQL",
  },
  description:
    "Primary flow: caller posts auth token, server streams CSV.\n\n" +
    "Alternative flow: invalid token returns 401.",
  acceptanceCriteria: [
    {
      title: "Valid token streams CSV",
      given: ["a valid auth token"],
      when: ["the client GETs /export"],
      then: ["the response is 200", "the body is a CSV"],
    },
  ],
  definitionOfDone: ["Code merged to main", "Tests passing in CI"],
  notes: "",
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
    expect(strongs.map((s) => s.text)).toEqual(["As a ", ", I want ", ", so that "]);
  });

  it("emits Description / Acceptance Criteria / Definition of Done section headings", () => {
    const adf = buildIssueDescriptionAdf({ story });
    const headings = adf.content
      .filter((b): b is { type: "heading"; attrs: { level: 1 | 2 | 3 | 4 | 5 | 6 }; content: { type: "text"; text: string }[] } => b.type === "heading")
      .map((h) => ({ level: h.attrs.level, text: h.content.map((c) => c.text).join("") }));
    expect(headings).toEqual(
      expect.arrayContaining([
        { level: 2, text: "Description" },
        { level: 2, text: "Acceptance Criteria" },
        { level: 3, text: "Valid token streams CSV" },
        { level: 2, text: "Definition of Done" },
      ]),
    );
  });

  it("splits description on blank lines into separate paragraphs", () => {
    const adf = buildIssueDescriptionAdf({ story });
    const descIdx = adf.content.findIndex(
      (b) => b.type === "heading" && b.content[0]?.text === "Description",
    );
    let paragraphCount = 0;
    for (let i = descIdx + 1; i < adf.content.length; i++) {
      if (adf.content[i].type !== "paragraph") break;
      paragraphCount++;
    }
    expect(paragraphCount).toBeGreaterThanOrEqual(2);
  });

  it("renders Gherkin scenarios as bullet lists", () => {
    const adf = buildIssueDescriptionAdf({ story });
    const acIdx = adf.content.findIndex(
      (b) => b.type === "heading" && b.content[0]?.text === "Acceptance Criteria",
    );
    const after = adf.content.slice(acIdx + 1);
    const list = after.find((b) => b.type === "bulletList");
    expect(list).toBeTruthy();
  });

  it("includes Constraints section when constraints are supplied", () => {
    const adf = buildIssueDescriptionAdf({ story, constraints: "Use the existing auth middleware." });
    const has = adf.content.some(
      (b) => b.type === "heading" && b.content[0]?.text === "Constraints",
    );
    expect(has).toBe(true);
  });

  it("omits Constraints section when none supplied", () => {
    const adf = buildIssueDescriptionAdf({ story });
    const has = adf.content.some(
      (b) => b.type === "heading" && b.content[0]?.text === "Constraints",
    );
    expect(has).toBe(false);
  });

  it("omits Notes section when story has none", () => {
    const adf = buildIssueDescriptionAdf({ story });
    const has = adf.content.some(
      (b) => b.type === "heading" && b.content[0]?.text === "Notes",
    );
    expect(has).toBe(false);
  });

  it("omits Acceptance Criteria section when includeAcceptanceCriteria is false", () => {
    const adf = buildIssueDescriptionAdf({ story, includeAcceptanceCriteria: false });
    const hasAcHeading = adf.content.some(
      (b) => b.type === "heading" && b.content[0]?.text === "Acceptance Criteria",
    );
    const hasScenarioHeading = adf.content.some(
      (b) => b.type === "heading" && b.content[0]?.text === "Valid token streams CSV",
    );
    expect(hasAcHeading).toBe(false);
    expect(hasScenarioHeading).toBe(false);
  });
});
