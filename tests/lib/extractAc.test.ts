import { describe, it, expect } from "vitest";
import { extractAcceptanceCriteria } from "@/lib/markdown/extractAc";

describe("lib/markdown/extractAcceptanceCriteria", () => {
  it("returns null when there is no AC section", () => {
    const md = "## Scope\n- a\n\n## Notes\n- nothing here";
    const out = extractAcceptanceCriteria(md);
    expect(out.acSection).toBeNull();
    expect(out.bodyWithoutAc).toBe(md);
  });

  it("extracts a ## heading-style AC section and strips it from the body", () => {
    const md = [
      "**As a** user.",
      "",
      "## Scope",
      "- one",
      "",
      "## Acceptance criteria",
      "- Returns 200",
      "- Returns 401",
      "",
      "## Notes",
      "Something.",
    ].join("\n");
    const out = extractAcceptanceCriteria(md);
    expect(out.acSection).toBe("- Returns 200\n- Returns 401");
    expect(out.bodyWithoutAc).toContain("## Scope");
    expect(out.bodyWithoutAc).toContain("## Notes");
    expect(out.bodyWithoutAc).not.toContain("Returns 200");
    expect(out.bodyWithoutAc).not.toMatch(/^## Acceptance criteria/m);
  });

  it("ends a ## section at the next ## or # heading", () => {
    const md = "## Acceptance criteria\n- A\n- B\n# Trailing\nx";
    const out = extractAcceptanceCriteria(md);
    expect(out.acSection).toBe("- A\n- B");
  });

  it("handles a deeper ### AC heading without consuming sibling ## sections", () => {
    const md = "## Scope\n- a\n\n### Acceptance criteria\n1. one\n2. two\n\n## Notes\nx";
    const out = extractAcceptanceCriteria(md);
    expect(out.acSection).toBe("1. one\n2. two");
    expect(out.bodyWithoutAc).toContain("## Notes");
  });

  it("extracts a **Acceptance criteria:** bold-label section", () => {
    const md = [
      "**Summary:** thing.",
      "",
      "**Description:** body.",
      "",
      "**Acceptance criteria:**",
      "1. First",
      "2. Second",
      "",
      "**Other:** more.",
    ].join("\n");
    const out = extractAcceptanceCriteria(md);
    expect(out.acSection).toBe("1. First\n2. Second");
    expect(out.bodyWithoutAc).toContain("**Summary:** thing.");
    expect(out.bodyWithoutAc).toContain("**Other:** more.");
    expect(out.bodyWithoutAc).not.toContain("First");
  });

  it("picks up same-line content on a label heading (`**Acceptance criteria:** value`)", () => {
    const md = "**Acceptance criteria:** Returns 200 with CSV body.\n\n**Other:** x";
    const out = extractAcceptanceCriteria(md);
    expect(out.acSection).toBe("Returns 200 with CSV body.");
  });

  it("is case-insensitive on the heading text", () => {
    const md = "## ACCEPTANCE Criteria\n- yep";
    const out = extractAcceptanceCriteria(md);
    expect(out.acSection).toBe("- yep");
  });
});
