"use client";

import { MermaidDiagram } from "@/components/MermaidDiagram";
import { buildTaskGraphMermaid } from "@/lib/epic/taskGraph";
import type { EpicTask } from "@/lib/epic/tasks";
import type { ReviewMap } from "@/lib/review/types";

type Props = {
  tasks: EpicTask[];
  reviews: ReviewMap;
  assignees?: Record<string, string | undefined>;
};

export function TaskGraph({ tasks, reviews, assignees }: Props) {
  if (tasks.length === 0) return null;
  const source = buildTaskGraphMermaid({ tasks, reviews, assignees });
  if (!source) return null;
  return (
    <div
      // Force the mermaid-rendered SVG to fill the sidebar width. mermaid
      // emits an inline width/height on the SVG by default; overriding with
      // `width: 100% !important` via the arbitrary-variant selector pins it
      // to the container.
      className="rounded-md border border-rule bg-surface p-2 overflow-x-auto [&_svg]:!w-full [&_svg]:!h-auto"
    >
      <MermaidDiagram source={source} />
    </div>
  );
}
