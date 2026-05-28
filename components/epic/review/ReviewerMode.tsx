"use client";

import { Button } from "@/components/ui/Button";
import { EpicPreview } from "@/components/epic/review/EpicPreview";
import { ReviewNav } from "@/components/epic/review/ReviewNav";
import { ReviewTaskPanel } from "@/components/epic/review/ReviewTaskPanel";
import { TaskGraph } from "@/components/epic/review/TaskGraph";
import { allReviewed, getReview } from "@/lib/review/state";
import type { EpicTask } from "@/lib/epic/tasks";
import type { ReviewMap, InterferenceMap, SubtaskReview } from "@/lib/review/types";

type Props = {
  epicTitle: string;
  epicDescriptionHtml: string;
  tasks: EpicTask[];
  reviews: ReviewMap;
  interference: InterferenceMap;
  selectedId: string | null;
  refreshKey: number;
  onSelect: (id: string | null) => void;
  onEditTasks: () => void;
  onFinalize: () => void;
  onTitleChange: (id: string, title: string) => void;
  onSetLabels: (id: string, labels: string[]) => void;
  onAddLink: (blockerId: string, blockedId: string) => void;
  onRemoveLink: (blockerId: string, blockedId: string) => void;
  onReviewChange: (id: string, patch: Partial<SubtaskReview>) => void;
  onDelete: (id: string) => void;
};

export function ReviewerMode(props: Props) {
  const selected = props.tasks.find((s) => s.id === props.selectedId) ?? null;
  const finalizeReady = allReviewed(props.tasks.map((t) => t.id), props.reviews);
  const assignees = Object.fromEntries(
    Object.entries(props.reviews)
      .filter(([, r]) => r.assignee)
      .map(([id, r]) => [id, r.assignee as string]),
  );

  return (
    <div className="flex-1 min-h-0 flex">
      <aside className="w-[320px] shrink-0 border-r border-rule bg-surface overflow-y-auto p-4 flex flex-col gap-4">
        <EpicPreview title={props.epicTitle} descriptionHtml={props.epicDescriptionHtml} tasks={props.tasks} />
        <ReviewNav
          tasks={props.tasks}
          reviews={props.reviews}
          selectedId={props.selectedId}
          onSelect={props.onSelect}
          interference={props.interference}
        />
        <div>
          <h3 className="hig-section-label">Task graph</h3>
          <TaskGraph tasks={props.tasks} reviews={props.reviews} assignees={assignees} />
        </div>
        <div className="mt-auto flex flex-col gap-2 pt-2 border-t border-rule">
          <Button
            type="button"
            disabled={!finalizeReady}
            title={finalizeReady ? undefined : "You need to review all the tasks and resolve requested changes"}
            onClick={props.onFinalize}
          >
            Finalize
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={props.onEditTasks}><span aria-hidden="true">←</span> Back to tabs</Button>
        </div>
      </aside>

      <div className="flex-1 min-h-0 overflow-y-auto p-5">
        {selected ? (
          <ReviewTaskPanel
            key={selected.id}
            task={selected}
            allTasks={props.tasks}
            review={getReview(props.reviews, selected.id)}
            warning={props.interference[selected.id]}
            refreshKey={props.refreshKey}
            onTitleChange={(title) => props.onTitleChange(selected.id, title)}
            onSetLabels={(labels) => props.onSetLabels(selected.id, labels)}
            onAddLink={props.onAddLink}
            onRemoveLink={props.onRemoveLink}
            onReviewChange={(patch) => props.onReviewChange(selected.id, patch)}
            onDelete={() => props.onDelete(selected.id)}
          />
        ) : (
          <p className="text-hig-body text-ink-secondary">Select a task from the navigation to review it.</p>
        )}
      </div>
    </div>
  );
}
