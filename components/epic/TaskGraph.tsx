"use client";

import { MermaidDiagram } from "@/components/MermaidDiagram";
import { buildTaskGraphMermaid } from "@/lib/epic/taskGraph";
import type { EpicTask } from "@/lib/epic/tasks";

type Props = {
  tasks: EpicTask[];
  assignees?: Record<string, string | undefined>;
};

export function TaskGraph({ tasks, assignees }: Props) {
  if (tasks.length === 0) return null;
  const source = buildTaskGraphMermaid({ tasks, assignees });
  if (!source) return null;
  return (
    <div className="rounded-md border border-rule bg-surface p-2 overflow-x-auto [&_svg]:!w-full [&_svg]:!h-auto">
      <MermaidDiagram source={source} />
    </div>
  );
}
