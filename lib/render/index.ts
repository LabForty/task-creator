import type { Requirement, Story } from "@/lib/pipeline";
import type { Diagrams, MermaidFormat } from "@/lib/jobs/types";

export type DraftRenderInput = { constraints?: string };

const DIAGRAM_TITLES: Record<MermaidFormat, string> = {
  flow: "Flow",
  sequence: "Sequence",
  interaction: "Interaction",
};

export function renderDiagramsBlock(diagrams: Diagrams): string | null {
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

// Matches an existing `## Diagrams` section from its heading to end-of-string.
// `renderDiagramsBlock` always emits this section last, so consuming to EOF
// is safe — anything the planner or user has above it is preserved.
const DIAGRAMS_BLOCK_RE = /\n*## Diagrams\b[\s\S]*$/;

// Surgically replace (or append, or strip) the `## Diagrams` section of the
// supplied markdown so it matches the current diagrams state. Preserves all
// other edits to the markdown (description body, AC, etc.) so manual
// textarea changes aren't clobbered when diagrams are created, regenerated,
// or edited individually.
//
// - If `diagrams` produces a non-empty block: replace an existing block, or
//   append one when none is present.
// - If `diagrams` is empty/absent: strip any existing block.
export function syncDiagramsInMarkdown(
  markdown: string,
  diagrams: Diagrams | undefined,
): string {
  const rendered = diagrams ? renderDiagramsBlock(diagrams) : null;
  const hasBlock = DIAGRAMS_BLOCK_RE.test(markdown);
  if (rendered) {
    if (hasBlock) return markdown.replace(DIAGRAMS_BLOCK_RE, `\n\n${rendered}`);
    return markdown.trimEnd() + `\n\n${rendered}`;
  }
  return hasBlock ? markdown.replace(DIAGRAMS_BLOCK_RE, "").trimEnd() : markdown;
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
    const block = renderDiagramsBlock(diagrams);
    if (block) sections.push(block);
  }
  return sections.join("\n\n");
}
