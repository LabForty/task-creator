"use client";

import { Button } from "@/components/ui/Button";
import { SubtaskCard } from "@/components/epic/SubtaskCard";
import type { SubTask } from "@/lib/subtasks/types";

type Props = {
  subtasks: SubTask[];
  onUpdate: (id: string, patch: { title?: string; description?: string }) => void;
  onSetLabels: (id: string, labels: string[]) => void;
  onAddLink: (blockerId: string, blockedId: string) => void;
  onRemoveLink: (blockerId: string, blockedId: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
};

export function SubtaskList({ subtasks, onUpdate, onSetLabels, onAddLink, onRemoveLink, onDelete, onAdd }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h2 className="text-hig-title3">Sub-tasks</h2>
        <Button type="button" size="sm" variant="secondary" onClick={onAdd}>Add sub-task</Button>
      </header>
      {subtasks.map((s) => (
        <SubtaskCard
          key={s.id}
          subtask={s}
          allSubtasks={subtasks}
          onUpdate={(patch) => onUpdate(s.id, patch)}
          onSetLabels={(labels) => onSetLabels(s.id, labels)}
          onAddLink={onAddLink}
          onRemoveLink={onRemoveLink}
          onDelete={() => onDelete(s.id)}
        />
      ))}
    </div>
  );
}
