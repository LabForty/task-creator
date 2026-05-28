import type { EpicTask } from "./tasks";
import type { ReviewMap } from "@/lib/review/types";

export type TaskGraphInput = {
  tasks: EpicTask[];
  reviews: ReviewMap;
  assignees?: Record<string, string | undefined>;
};

const MAX_TITLE = 40;

// Mermaid uses HTML-ish entity references inside node labels. We can't emit
// real `&` because mermaid's parser interprets unescaped `&` poorly inside
// brackets, and we can't emit `<` or `>` either. The convention this codebase
// follows (see lib/jira/diagrams) is to substitute `#` for the entity prefix.
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

function statusClass(reviews: ReviewMap, id: string): string {
  const s = reviews[id]?.status;
  if (s === "approved" || s === "denied" || s === "change_requested") return s;
  return "pending";
}

export function buildTaskGraphMermaid(input: TaskGraphInput): string {
  if (input.tasks.length === 0) return "";

  const lines: string[] = [
    // Spacing / curve directives. useMaxWidth lets the rendered SVG scale
    // down to the sidebar; nodeSpacing/rankSpacing give breathing room
    // between siblings and between rows respectively.
    "%%{init: { 'flowchart': { 'nodeSpacing': 28, 'rankSpacing': 40, 'curve': 'basis', 'padding': 12, 'useMaxWidth': true } } }%%",
    "graph TD",
    // Deeper saturated tints so the status reads on first glance.
    "  classDef approved fill:#bbf7d0,stroke:#15803d,stroke-width:1.5px,color:#064e3b;",
    "  classDef denied fill:#fecaca,stroke:#b91c1c,stroke-width:1.5px,color:#7f1d1d;",
    "  classDef change_requested fill:#fde68a,stroke:#a16207,stroke-width:1.5px,color:#713f12;",
    "  classDef pending fill:#e2e8f0,stroke:#475569,stroke-width:1.5px,color:#0f172a;",
  ];

  for (const t of input.tasks) {
    const title = escapeMermaid(truncate(t.title || "(untitled)"));
    const assignee = input.assignees?.[t.id];
    const label = assignee ? `${title}<br/>(${escapeMermaid(assignee)})` : title;
    lines.push(`  t_${t.id}["${label}"]:::${statusClass(input.reviews, t.id)}`);
  }

  // Edges from blocks. blockedBy is just the inverse, so we only emit from blocks.
  for (const t of input.tasks) {
    for (const blockedId of t.blocks) {
      lines.push(`  t_${t.id} --> t_${blockedId}`);
    }
  }

  return lines.join("\n");
}
