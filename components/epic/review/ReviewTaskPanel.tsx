"use client";

import { EpicTaskEditor } from "@/components/epic/EpicTaskEditor";
import { ReviewControls } from "@/components/epic/review/ReviewControls";
import type { EpicTask } from "@/lib/epic/tasks";
import type { SubtaskReview, InterferenceWarning } from "@/lib/review/types";

type Props = {
  task: EpicTask;
  allTasks: EpicTask[];
  review: SubtaskReview;
  warning?: InterferenceWarning;
  refreshKey: number;
  onTitleChange: (title: string) => void;
  onSetLabels: (labels: string[]) => void;
  onAddLink: (blockerId: string, blockedId: string) => void;
  onRemoveLink: (blockerId: string, blockedId: string) => void;
  onReviewChange: (patch: Partial<SubtaskReview>) => void;
  onDelete: () => void;
};

export function ReviewTaskPanel({
  task, allTasks, review, warning, refreshKey,
  onTitleChange, onSetLabels, onAddLink, onRemoveLink, onReviewChange, onDelete,
}: Props) {
  return (
    <div className="flex flex-col gap-4">
      {warning && (
        <div className="rounded-md bg-warning-tint border border-warning/40 px-3 py-2" role="alert">
          <p className="text-hig-footnote text-ink">Possible interference: {warning.reason}</p>
        </div>
      )}
      <EpicTaskEditor
        taskId={task.id}
        allTasks={allTasks}
        labels={task.labels}
        blocks={task.blocks}
        blockedBy={task.blockedBy}
        refreshKey={refreshKey}
        onTitleChange={onTitleChange}
        onSetLabels={onSetLabels}
        onAddLink={onAddLink}
        onRemoveLink={onRemoveLink}
        onDelete={onDelete}
      />
      <div className="hig-card p-4">
        <h3 className="hig-section-label mb-2">Review</h3>
        <ReviewControls review={review} onChange={onReviewChange} />
      </div>
    </div>
  );
}
