import { describe, it, expect } from "vitest";
import { renderFinalized } from "@/lib/render";
import type { Requirement, Story } from "@/lib/pipeline";
import type { Diagrams } from "@/lib/jobs/types";

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
    iWant: "download the user table as a CSV",
    soThat: "hand it to auditors without writing SQL",
  },
  scope: ["Users page", "GET /api/users/export"],
  requirements: [
    {
      category: "Endpoint",
      items: [
        "Add GET /api/users/export returning text/csv",
        "Stream the body for tables larger than 10k rows",
      ],
    },
    {
      category: "UI",
      items: ["Add an Export button on the Users page that triggers a download"],
    },
  ],
  acceptanceCriteria: [
    "Valid session returns 200 with a CSV body",
    "Missing or invalid session returns 401",
    "100k-row table downloads without timing out",
  ],
  outOfScope: [],
};

describe("lib/render.renderFinalized", () => {
  it("uses Story.title as the document title", () => {
    const md = renderFinalized(req, story, {});
    expect(md.startsWith("# Implement /export endpoint")).toBe(true);
  });

  it("emits the As-a / I-want-to / So-I-can user-story line", () => {
    const md = renderFinalized(req, story, {});
    expect(md).toContain("**As a** platform operator");
    expect(md).toContain("**I want to** download the user table as a CSV");
    expect(md).toContain("**so I can** hand it to auditors without writing SQL");
  });

  it("emits Scope / Requirements / Acceptance criteria in order", () => {
    const md = renderFinalized(req, story, {});
    const scope = md.indexOf("## Scope");
    const reqs = md.indexOf("## Requirements");
    const ac = md.indexOf("## Acceptance criteria");
    expect(scope).toBeGreaterThan(-1);
    expect(reqs).toBeGreaterThan(scope);
    expect(ac).toBeGreaterThan(reqs);
  });

  it("renders requirements as grouped nested bullets", () => {
    const md = renderFinalized(req, story, {});
    expect(md).toContain("- Endpoint:");
    expect(md).toContain("  - Add GET /api/users/export returning text/csv");
    expect(md).toContain("  - Stream the body for tables larger than 10k rows");
    expect(md).toContain("- UI:");
  });

  it("renders acceptance criteria as flat bullets, not Gherkin", () => {
    const md = renderFinalized(req, story, {});
    expect(md).toContain("- Valid session returns 200 with a CSV body");
    expect(md).toContain("- Missing or invalid session returns 401");
    expect(md).not.toContain("**Given**");
    expect(md).not.toContain("**When**");
    expect(md).not.toContain("**Then**");
  });

  it("omits ## Scope when the story has none", () => {
    const md = renderFinalized(req, { ...story, scope: [] }, {});
    expect(md).not.toMatch(/^## Scope$/m);
  });

  it("omits ## Out of scope when the story has none", () => {
    const md = renderFinalized(req, story, {});
    expect(md).not.toMatch(/^## Out of scope$/m);
  });

  it("includes ## Out of scope when populated", () => {
    const md = renderFinalized(
      req,
      { ...story, outOfScope: ["Scheduled exports", "Non-CSV formats"] },
      {},
    );
    expect(md).toContain("## Out of scope");
    expect(md).toContain("- Scheduled exports");
    expect(md).toContain("- Non-CSV formats");
  });

  it("omits ## Diagrams when no diagrams are passed", () => {
    const md = renderFinalized(req, story, {});
    expect(md).not.toMatch(/^## Diagrams$/m);
  });

  it("embeds available diagrams as fenced mermaid blocks", () => {
    const diagrams: Diagrams = {
      flow: "flowchart TD\nA-->B",
      sequence: "sequenceDiagram\nA->>B: hello",
    };
    const md = renderFinalized(req, story, {}, diagrams);
    expect(md).toContain("## Diagrams");
    expect(md).toContain("### Flow");
    expect(md).toContain("```mermaid\nflowchart TD\nA-->B\n```");
    expect(md).toContain("### Sequence");
    expect(md).toContain("```mermaid\nsequenceDiagram\nA->>B: hello\n```");
    expect(md).not.toContain("### Interaction");
  });
});
