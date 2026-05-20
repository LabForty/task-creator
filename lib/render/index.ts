import type { Requirement, Story } from "@/lib/pipeline";
import type { Diagrams, MermaidFormat } from "@/lib/jobs/types";

export type DraftRenderInput = { constraints?: string };

const DIAGRAM_TITLES: Record<MermaidFormat, string> = {
  flow: "Flow",
  sequence: "Sequence",
  interaction: "Interaction",
};

function renderUserStoryLine(story: Story): string {
  const { asA, iWant, soThat } = story.userStory;
  return `**As a** ${asA.trim()}, **I want to** ${iWant.trim()}, **so I can** ${soThat.trim()}.`;
}

function renderScope(items: string[]): string {
  return `## Scope\n${items.map((s) => `- ${s.trim()}`).join("\n")}`;
}

function renderRequirements(groups: Story["requirements"]): string {
  const lines: string[] = ["## Requirements"];
  for (const g of groups) {
    lines.push(`- ${g.category.trim()}:`);
    for (const item of g.items) {
      lines.push(`  - ${item.trim()}`);
    }
  }
  return lines.join("\n");
}

function renderAcceptanceCriteria(items: string[]): string {
  return `## Acceptance criteria\n${items.map((s) => `- ${s.trim()}`).join("\n")}`;
}

function renderOutOfScope(items: string[]): string {
  return `## Out of scope\n${items.map((s) => `- ${s.trim()}`).join("\n")}`;
}

function renderDiagrams(diagrams: Diagrams): string | null {
  const order: MermaidFormat[] = ["flow", "sequence", "interaction"];
  const blocks: string[] = [];
  for (const fmt of order) {
    const src = diagrams[fmt];
    if (!src || !src.trim()) continue;
    blocks.push(`### ${DIAGRAM_TITLES[fmt]}\n\`\`\`mermaid\n${src.trim()}\n\`\`\``);
  }
  if (blocks.length === 0) return null;
  return `## Diagrams\n${blocks.join("\n\n")}`;
}

// Render the finalized task as AI/dev-actionable markdown. Shape:
//
//   # <title>
//
//   **As a <role>, I want to <action>, so I can <outcome>.**
//
//   ## Scope                  (omitted if empty)
//   - surface 1
//
//   ## Requirements
//   - Category 1:
//     - item
//     - item
//
//   ## Acceptance criteria
//   - bullet
//
//   ## Out of scope           (omitted if empty)
//   - bullet
//
//   ## Diagrams               (omitted if no diagrams provided)
//   ### Flow
//   ```mermaid
//   ...
//   ```
//
// Constraints from the draft are not echoed back into the output — they're
// guidance for the planner, not part of the ticket.
export function renderFinalized(
  _req: Requirement,
  story: Story,
  _draft: DraftRenderInput,
  diagrams?: Diagrams,
): string {
  const sections: string[] = [];

  sections.push(`# ${story.title}`);
  sections.push(renderUserStoryLine(story));

  if (story.scope && story.scope.length > 0) {
    sections.push(renderScope(story.scope));
  }

  sections.push(renderRequirements(story.requirements));
  sections.push(renderAcceptanceCriteria(story.acceptanceCriteria));

  if (story.outOfScope && story.outOfScope.length > 0) {
    sections.push(renderOutOfScope(story.outOfScope));
  }

  if (diagrams) {
    const block = renderDiagrams(diagrams);
    if (block) sections.push(block);
  }

  return sections.join("\n\n");
}
