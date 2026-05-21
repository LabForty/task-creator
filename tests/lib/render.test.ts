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
  markdown: [
    "**As a** platform operator, **I want to** download the user table as a CSV, **so I can** hand it to auditors without writing SQL.",
    "",
    "## Scope",
    "- GET /api/users/export",
    "",
    "## Requirements",
    "- Endpoint:",
    "  - Add GET /api/users/export returning text/csv",
    "",
    "## Acceptance criteria",
    "- Valid session returns 200 with a CSV body",
    "- Missing or invalid session returns 401",
  ].join("\n"),
};

describe("lib/render.renderFinalized", () => {
  it("emits the story markdown verbatim when no diagrams are passed", () => {
    const md = renderFinalized(req, story, {});
    expect(md).toBe(story.markdown.trim());
  });

  it("omits the Diagrams section when no diagrams are passed", () => {
    const md = renderFinalized(req, story, {});
    expect(md).not.toMatch(/^## Diagrams$/m);
  });

  it("embeds available diagrams as fenced mermaid blocks below the body", () => {
    const diagrams: Diagrams = {
      flow: "flowchart TD\nA-->B",
      sequence: "sequenceDiagram\nA->>B: hello",
    };
    const md = renderFinalized(req, story, {}, diagrams);
    expect(md.startsWith(story.markdown.trim())).toBe(true);
    expect(md).toContain("## Diagrams");
    expect(md).toContain("### Flow");
    expect(md).toContain("```mermaid\nflowchart TD\nA-->B\n```");
    expect(md).toContain("### Sequence");
    expect(md).toContain("```mermaid\nsequenceDiagram\nA->>B: hello\n```");
    expect(md).not.toContain("### Interaction");
  });

  it("omits diagram blocks with empty source", () => {
    const diagrams: Diagrams = { flow: "  ", sequence: "sequenceDiagram\nA->>B: hi" };
    const md = renderFinalized(req, story, {}, diagrams);
    expect(md).not.toContain("### Flow");
    expect(md).toContain("### Sequence");
  });
});
