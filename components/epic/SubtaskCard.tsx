"use client";

import { Button } from "@/components/ui/Button";
import { TextField, TextArea } from "@/components/ui/TextField";
import { LabelsEditor } from "@/components/epic/LabelsEditor";
import { SubtaskLinksField } from "@/components/epic/SubtaskLinksField";
import { MAX_DESCRIPTION, type SubTask } from "@/lib/subtasks/types";

type Props = {
  subtask: SubTask;
  allSubtasks: SubTask[];
  onUpdate: (patch: { title?: string; description?: string }) => void;
  onSetLabels: (labels: string[]) => void;
  onAddLink: (blockerId: string, blockedId: string) => void;
  onRemoveLink: (blockerId: string, blockedId: string) => void;
  onDelete: () => void;
};

export function SubtaskCard({ subtask, allSubtasks, onUpdate, onSetLabels, onAddLink, onRemoveLink, onDelete }: Props) {
  return (
    <div className="hig-card p-4 flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <TextField
            label="Title"
            value={subtask.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            placeholder="Sub-task title"
          />
        </div>
        <Button type="button" variant="ghost" size="sm" aria-label="Delete sub-task" onClick={onDelete}>
          Delete
        </Button>
      </div>

      <div className="flex flex-col gap-1">
        <TextArea
          label="Description"
          value={subtask.description}
          maxLength={MAX_DESCRIPTION}
          onChange={(e) => onUpdate({ description: e.target.value })}
          placeholder="What this sub-task covers"
          className="min-h-[80px]"
        />
        <span className="text-hig-caption text-ink-tertiary self-end">
          {subtask.description.length} / {MAX_DESCRIPTION}
        </span>
      </div>

      <LabelsEditor value={subtask.labels} onChange={onSetLabels} />
      <SubtaskLinksField subtask={subtask} allSubtasks={allSubtasks} onAddLink={onAddLink} onRemoveLink={onRemoveLink} />
    </div>
  );
}
