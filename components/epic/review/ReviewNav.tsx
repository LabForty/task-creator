"use client";

import { getReview } from "@/lib/review/state";
import type { EpicTask } from "@/lib/epic/tasks";
import type { ReviewMap, ReviewStatus, InterferenceMap } from "@/lib/review/types";

const STATUS_CLASS: Record<ReviewStatus, string> = {
  approved: "border-success text-success",
  denied: "border-danger text-danger",
  change_requested: "border-warning text-warning",
  pending: "border-rule text-ink-secondary",
};

type Props = {
  tasks: EpicTask[];
  reviews: ReviewMap;
  selectedId: string | null; // null = epic
  onSelect: (id: string | null) => void;
  interference: InterferenceMap;
};

export function ReviewNav({ tasks, reviews, selectedId, onSelect, interference }: Props) {
  return (
    <nav aria-label="Review navigation" className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-current={selectedId === null}
        className={`text-left px-2 py-1 rounded text-hig-footnote ${selectedId === null ? "bg-surface-inset" : ""}`}
      >
        Epic
      </button>
      {tasks.map((s) => {
        const status = getReview(reviews, s.id).status;
        const warned = Boolean(interference[s.id]);
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            aria-current={selectedId === s.id}
            className={`text-left px-2 py-1 rounded border-l-2 text-hig-footnote ${STATUS_CLASS[status]} ${selectedId === s.id ? "bg-surface-inset" : ""}`}
          >
            {s.title || "(untitled)"}
            {s.uploadedIssueKey && (
              <span className="ml-1 inline-flex items-center px-1.5 rounded-sm bg-success/10 text-success text-[10px] font-semibold uppercase tracking-wide">
                {s.uploadedIssueKey}
              </span>
            )}
            {warned && <span aria-label="interference warning" title="Possible interference" className="ml-1 text-warning">⚠</span>}
          </button>
        );
      })}
    </nav>
  );
}
