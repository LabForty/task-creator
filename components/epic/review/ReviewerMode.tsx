"use client";

import { Button } from "@/components/ui/Button";
import { EpicPreview } from "@/components/epic/review/EpicPreview";
import { ReviewNav } from "@/components/epic/review/ReviewNav";
import { ReviewTaskPanel } from "@/components/epic/review/ReviewTaskPanel";
import { getReview } from "@/lib/review/state";
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
  onTitleChange: (id: string, title: string) => void;
  onSetLabels: (id: string, labels: string[]) => void;
  onAddLink: (blockerId: string, blockedId: string) => void;
  onRemoveLink: (blockerId: string, blockedId: string) => void;
  onReviewChange: (id: string, patch: Partial<SubtaskReview>) => void;
  onDelete: (id: string) => void;
};

export function ReviewerMode(props: Props) {
  const selected = props.tasks.find((s) => s.id === props.selectedId) ?? null;

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
          <h3 className="hig-section-label">Diagrams</h3>
          <p className="text-hig-footnote text-ink-tertiary">Diagram from tasks arrives in a later phase.</p>
        </div>
        <div className="mt-auto flex flex-col gap-2 pt-2 border-t border-rule">
          <Button type="button" disabled title="You need to review all the tasks and resolve requested changes">
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
