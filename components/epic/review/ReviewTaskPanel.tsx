"use client";

import { SubtaskCard } from "@/components/epic/SubtaskCard";
import { ReviewControls } from "@/components/epic/review/ReviewControls";
import type { SubTask } from "@/lib/subtasks/types";
import type { SubtaskReview, InterferenceWarning } from "@/lib/review/types";

type Props = {
  subtask: SubTask;
  allSubtasks: SubTask[];
  review: SubtaskReview;
  warning?: InterferenceWarning;
  onUpdate: (patch: { title?: string; description?: string }) => void;
  onSetLabels: (labels: string[]) => void;
  onAddLink: (blockerId: string, blockedId: string) => void;
  onRemoveLink: (blockerId: string, blockedId: string) => void;
  onReviewChange: (patch: Partial<SubtaskReview>) => void;
  onDelete: () => void;
};

export function ReviewTaskPanel({
  subtask, allSubtasks, review, warning, onUpdate, onSetLabels, onAddLink, onRemoveLink, onReviewChange, onDelete,
}: Props) {
  return (
    <div className="flex flex-col gap-4">
      {warning && (
        <div className="rounded-md bg-warning-tint border border-warning/40 px-3 py-2" role="alert">
          <p className="text-hig-footnote text-ink">Possible interference: {warning.reason}</p>
        </div>
      )}
      <SubtaskCard
        subtask={subtask}
        allSubtasks={allSubtasks}
        onUpdate={onUpdate}
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
