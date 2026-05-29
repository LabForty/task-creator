"use client";

import { EpicTaskCard } from "@/components/epic/EpicTaskCard";
import type { EpicTask } from "@/lib/epic/tasks";

type BakeState = "pending" | "baking" | "baked" | "failed";

type Props = {
  epicTitle: string;
  epicDescriptionPreview: string;
  tasks: EpicTask[];
  activeId: "epic" | string;
  bakeStatus: "idle" | "baking" | "baked";
  bakeProgress?: Record<string, BakeState>;
  bakeErrors?: Record<string, string>;
  bakeTotal?: number;
  bakeDone?: number;
  onSelect: (id: "epic" | string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onCancelBake: () => void;
  descriptionPreviewsById?: Record<string, string>;
  taskTypesById?: Record<string, string>;
};

export function EpicTaskCards(props: Props) {
  const baking = props.bakeStatus === "baking";

  return (
    <div className="flex flex-col gap-2 h-full min-h-0 overflow-y-auto p-3">
      {baking && (
        <div className="sticky top-0 z-10 -mt-3 -mx-3 px-3 py-2 bg-surface border-b border-rule flex items-center gap-2">
          <span className="text-hig-footnote font-medium text-ink">
            Baking {props.bakeDone ?? 0}/{props.bakeTotal ?? props.tasks.length}…
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={props.onCancelBake}
            className="px-2 py-0.5 rounded-sm text-hig-footnote bg-surface-muted text-ink hover:bg-surface-strong"
          >
            Cancel
          </button>
        </div>
      )}

      <EpicTaskCard
        kind="epic"
        title={props.epicTitle || "(untitled epic)"}
        descriptionPreview={props.epicDescriptionPreview}
        active={props.activeId === "epic"}
        onSelect={() => props.onSelect("epic")}
      />

      {props.tasks.map((t) => (
        <EpicTaskCard
          key={t.id}
          kind="task"
          title={t.title}
          descriptionPreview={props.descriptionPreviewsById?.[t.id] ?? ""}
          taskType={props.taskTypesById?.[t.id]}
          labels={t.labels}
          blocksCount={t.blocks.length}
          blockedByCount={t.blockedBy.length}
          uploadedIssueKey={t.uploadedIssueKey}
          active={props.activeId === t.id}
          bakeState={props.bakeProgress?.[t.id]}
          bakeError={props.bakeErrors?.[t.id]}
          onSelect={() => props.onSelect(t.id)}
          onDelete={() => props.onDelete(t.id)}
        />
      ))}

      <button
        type="button"
        onClick={props.onAdd}
        disabled={baking}
        aria-label="Add task"
        className="rounded-md border-2 border-dashed border-rule px-3 py-3 text-hig-footnote text-ink-tertiary hover:border-accent hover:text-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        + Add task
      </button>
    </div>
  );
}
