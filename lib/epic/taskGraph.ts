import type { EpicTask } from "./tasks";

export type TaskGraphInput = {
  tasks: EpicTask[];
  assignees?: Record<string, string | undefined>;
};

const MAX_TITLE = 40;

function escapeMermaid(text: string): string {
  return text
    .replace(/&/g, "#amp;")
    .replace(/"/g, "#quot;")
    .replace(/</g, "#lt;")
    .replace(/>/g, "#gt;");
}

function truncate(text: string): string {
  return text.length > MAX_TITLE ? text.slice(0, MAX_TITLE - 1) + "…" : text;
}

export function buildTaskGraphMermaid(input: TaskGraphInput): string {
  if (input.tasks.length === 0) return "";

  const lines: string[] = [
    "%%{init: { 'flowchart': { 'nodeSpacing': 28, 'rankSpacing': 40, 'curve': 'basis', 'padding': 12, 'useMaxWidth': true } } }%%",
    "graph TD",
    // Single neutral classDef — reviewer status coloring is gone (no more reviews map).
    "  classDef task fill:#e2e8f0,stroke:#475569,stroke-width:1.5px,color:#0f172a;",
  ];

  for (const t of input.tasks) {
    const title = escapeMermaid(truncate(t.title || "(untitled)"));
    const assignee = input.assignees?.[t.id];
    const label = assignee ? `${title}<br/>(${escapeMermaid(assignee)})` : title;
    lines.push(`  t_${t.id}["${label}"]:::task`);
  }

  for (const t of input.tasks) {
    for (const blockedId of t.blocks) {
      lines.push(`  t_${t.id} --> t_${blockedId}`);
    }
  }

  return lines.join("\n");
}
