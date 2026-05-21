import type { Requirement, Story } from "@/lib/pipeline";
import type { Diagrams, MermaidFormat } from "@/lib/jobs/types";

export type DraftRenderInput = { constraints?: string };

const DIAGRAM_TITLES: Record<MermaidFormat, string> = {
  flow: "Flow",
  sequence: "Sequence",
  interaction: "Interaction",
};

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

// Render the finalized ticket. With the template-driven pipeline the planner
// already produces the body markdown (shape dictated by the selected
// task-type template). All we do here is append a Diagrams section when
// mermaid sources exist, so "select all + copy" in the left pane includes
// the diagrams.
export function renderFinalized(
  _req: Requirement,
  story: Story,
  _draft: DraftRenderInput,
  diagrams?: Diagrams,
): string {
  const body = story.markdown.trim();
  const sections: string[] = [body];
  if (diagrams) {
    const block = renderDiagrams(diagrams);
    if (block) sections.push(block);
  }
  return sections.join("\n\n");
}
