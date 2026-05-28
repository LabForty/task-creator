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

  const lines: string[] = ["graph TD"];

  // Class definitions — same palette used elsewhere for the four review states.
  lines.push("  classDef approved fill:#dcfce7,stroke:#16a34a,color:#065f46;");
  lines.push("  classDef denied fill:#fee2e2,stroke:#dc2626,color:#7f1d1d;");
  lines.push("  classDef change_requested fill:#fef9c3,stroke:#ca8a04,color:#713f12;");
  lines.push("  classDef pending fill:#f1f5f9,stroke:#64748b,color:#0f172a;");

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
