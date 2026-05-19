import { describe, it, expect } from "vitest";
import { renderFinalized } from "@/lib/render";
import type { Requirement, Story } from "@/lib/pipeline";

const req: Requirement = {
  title: "Export users CSV",
  summary: "Operators can download the user table as a CSV.",
  problem: "Audit handoffs require slow manual SQL dumps today.",
  value: "Cuts audit handoff time and removes manual-export errors.",
  acceptanceCriteria: ["Returns 200 with a CSV body"],
  outOfScope: [],
  dependencies: [],
  risks: [],
};

const story: Story = {
  title: "Implement /export endpoint",
  userStory: {
    asA: "platform operator",
    iWant: "to download the user table as a CSV",
    soThat: "I can hand it to auditors without writing SQL",
  },
  description:
    "Primary flow: caller posts auth token, server streams CSV.\n\n" +
    "Alternative flow: invalid token returns 401.\n\n" +
    "Edge case: empty result set returns header row only.\n\n" +
    "Testing notes: integration tests with 0, 1, and N>1000 rows.",
  acceptanceCriteria: [
    {
      title: "Valid token streams CSV",
      given: ["a valid auth token"],
      when: ["the client GETs /export"],
      then: ["the response is 200", "the body is a CSV"],
    },
    {
      title: "Invalid token rejected",
      given: ["an invalid auth token"],
      when: ["the client GETs /export"],
      then: ["the response is 401"],
    },
  ],
  definitionOfDone: [
    "Code merged to main",
    "Tests passing in CI",
    "Telemetry added",
  ],
  notes: "",
};

describe("lib/render.renderFinalized", () => {
  it("uses Story.title as the document title", () => {
    const md = renderFinalized(req, story, {});
    expect(md.startsWith("# Implement /export endpoint")).toBe(true);
  });

  it("emits the As-a / I-want / So-that user-story line", () => {
    const md = renderFinalized(req, story, {});
    expect(md).toContain("**As a** platform operator");
    expect(md).toContain("**I want** to download the user table as a CSV");
    expect(md).toContain("**so that** I can hand it to auditors without writing SQL");
  });

  it("emits Description / Acceptance Criteria / Definition of Done in order", () => {
    const md = renderFinalized(req, story, {});
    const desc = md.indexOf("## Description");
    const ac = md.indexOf("## Acceptance Criteria");
    const dod = md.indexOf("## Definition of Done");
    expect(desc).toBeGreaterThan(-1);
    expect(ac).toBeGreaterThan(desc);
    expect(dod).toBeGreaterThan(ac);
  });

  it("renders each acceptance criterion as a Gherkin scenario with Given/When/Then", () => {
    const md = renderFinalized(req, story, {});
    expect(md).toContain("### Valid token streams CSV");
    expect(md).toContain("**Given** a valid auth token");
    expect(md).toContain("**When** the client GETs /export");
    expect(md).toContain("**Then** the response is 200");
    expect(md).toContain("**And** the body is a CSV");
  });

  it("renders the Definition of Done as a bulleted list", () => {
    const md = renderFinalized(req, story, {});
    expect(md).toContain("- Code merged to main");
    expect(md).toContain("- Tests passing in CI");
    expect(md).toContain("- Telemetry added");
  });

  it("includes the draft constraints verbatim under ## Constraints", () => {
    const md = renderFinalized(req, story, { constraints: "Use the existing auth middleware." });
    expect(md).toContain("## Constraints");
    expect(md).toContain("Use the existing auth middleware.");
  });

  it("omits ## Constraints when the draft supplies none", () => {
    const md = renderFinalized(req, story, {});
    expect(md).not.toMatch(/^## Constraints$/m);
  });

  it("omits ## Notes when the story has none", () => {
    const md = renderFinalized(req, story, {});
    expect(md).not.toMatch(/^## Notes$/m);
  });
});
