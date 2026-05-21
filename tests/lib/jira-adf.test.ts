import { describe, it, expect } from "vitest";
import { buildIssueDescriptionAdf, inline } from "@/lib/jira/adf";
import { markdownToAdf } from "@/lib/markdown/toAdf";
import type { Story } from "@/lib/pipeline";

const story: Story = {
  title: "Implement /export endpoint",
  markdown: [
    "**As a** platform operator, **I want to** download the user table as a CSV, **so I can** hand it to auditors without writing SQL.",
    "",
    "## Scope",
    "- GET /api/users/export",
    "- Users page Export button",
    "",
    "## Requirements",
    "- Endpoint:",
    "  - Add GET /api/users/export returning text/csv",
    "  - Stream the body for large tables",
    "",
    "## Acceptance criteria",
    "- Returns 200 with a CSV body",
    "- Returns 401 with no session",
  ].join("\n"),
};

describe("lib/jira/adf.inline (legacy helper)", () => {
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
});

describe("lib/jira/adf.buildIssueDescriptionAdf", () => {
  it("emits a valid ADF doc shape", () => {
    const adf = buildIssueDescriptionAdf({ story });
    expect(adf.version).toBe(1);
    expect(adf.type).toBe("doc");
    expect(Array.isArray(adf.content)).toBe(true);
    expect(adf.content.length).toBeGreaterThan(0);
  });

  it("emits Scope / Requirements / Acceptance criteria headings parsed from the markdown", () => {
    const adf = buildIssueDescriptionAdf({ story });
    const headings = adf.content
      .filter((b): b is { type: "heading"; attrs: { level: 1 | 2 | 3 | 4 | 5 | 6 }; content: { type: "text"; text: string }[] } => b.type === "heading")
      .map((h) => h.content.map((c) => c.text).join(""));
    expect(headings).toEqual(expect.arrayContaining(["Scope", "Requirements", "Acceptance criteria"]));
  });
});

describe("lib/markdown/toAdf", () => {
  it("preserves strong, em, and inline code marks", () => {
    const adf = markdownToAdf("**bold** *italic* `code`");
    const para = adf.content[0];
    expect(para.type).toBe("paragraph");
    if (para.type !== "paragraph") throw new Error();
    const marks = para.content.flatMap((n) => n.marks?.map((m) => m.type) ?? []);
    expect(marks).toEqual(expect.arrayContaining(["strong", "em", "code"]));
  });

  it("renders fenced ```mermaid blocks as codeBlock nodes with language attr", () => {
    const md = "Before.\n\n```mermaid\nflowchart TD\nA-->B\n```\n\nAfter.";
    const adf = markdownToAdf(md);
    const codeBlock = adf.content.find((n) => (n as { type: string }).type === "codeBlock") as
      | { type: "codeBlock"; attrs?: { language?: string }; content?: { type: "text"; text: string }[] }
      | undefined;
    expect(codeBlock).toBeTruthy();
    expect(codeBlock?.attrs?.language).toBe("mermaid");
    expect(codeBlock?.content?.[0]?.text).toContain("flowchart TD");
  });

  it("renders nested bullet lists", () => {
    const md = "- A\n  - A1\n  - A2\n- B";
    const adf = markdownToAdf(md);
    const list = adf.content[0];
    expect(list.type).toBe("bulletList");
  });
});
