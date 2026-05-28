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
    <div className="rounded-md border border-rule bg-surface p-2">
      <MermaidDiagram source={source} />
    </div>
  );
}
