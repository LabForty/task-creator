"use client";

import { Editor } from "@/components/Editor";
import { Button } from "@/components/ui/Button";
import { LabelsEditor } from "@/components/epic/LabelsEditor";
import { SubtaskLinksField } from "@/components/epic/SubtaskLinksField";
import { epicTaskNamespace, type EpicTask } from "@/lib/epic/tasks";
import type { SubTask } from "@/lib/subtasks/types";

type Props = {
  taskId: string;
  allTasks: EpicTask[];
  labels: string[];
  blocks: string[];
  blockedBy: string[];
  refreshKey: number;
  onTitleChange: (title: string) => void;
  onSetLabels: (labels: string[]) => void;
  onAddLink: (blockerId: string, blockedId: string) => void;
  onRemoveLink: (blockerId: string, blockedId: string) => void;
  onDelete: () => void;
};

export function EpicTaskEditor({
  taskId, allTasks, labels, blocks, blockedBy, refreshKey,
  onTitleChange, onSetLabels, onAddLink, onRemoveLink, onDelete,
}: Props) {
  // SubtaskLinksField wants SubTask-shaped objects; the descriptors carry the
  // ids/titles/links it needs (description/labels unused for link options).
  const self: SubTask = { id: taskId, title: "", description: "", labels, blocks, blockedBy };
  const allAsSubtasks: SubTask[] = allTasks.map((t) => ({ id: t.id, title: t.title, description: "", labels: t.labels, blocks: t.blocks, blockedBy: t.blockedBy }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" aria-label="Delete task" onClick={onDelete}>Delete task</Button>
      </div>
      <Editor
        key={`${taskId}:${refreshKey}`}
        namespace={epicTaskNamespace(taskId)}
        onFinalize={() => {}}
        hideSubmit
        onDraftChange={(d) => onTitleChange(d.title)}
      />
      <div className="hig-card p-4 flex flex-col gap-3">
        <h3 className="hig-section-label">Dependencies &amp; labels</h3>
        <LabelsEditor value={labels} onChange={onSetLabels} />
        <SubtaskLinksField subtask={self} allSubtasks={allAsSubtasks} onAddLink={onAddLink} onRemoveLink={onRemoveLink} />
      </div>
    </div>
  );
}
