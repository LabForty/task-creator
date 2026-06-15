"use client";

import { Button } from "@/components/ui/Button";
import type { EpicTask, ReviewStatus } from "@/lib/epic/tasks";

type Props = {
  tasks: EpicTask[];
  selectedId: "epic" | string;
  finalizedIds: Set<string>;
  failedIds: Record<string, string>;
  onSelect: (id: "epic" | string) => void;
  onUploadAll: () => void;
  onBackToEditing: () => void;
  uploadDisabled?: boolean;
};

function entryClass(active: boolean): string {
  return (
    "w-full text-left px-3 py-2 rounded-md text-hig-body transition-colors " +
    (active ? "bg-accent-tint text-accent font-medium" : "text-ink hover:bg-surface-muted")
  );
}

function statusDot(status?: ReviewStatus): { cls: string; label: string } {
  switch (status) {
    case "approved": return { cls: "bg-success", label: "approved" };
    case "denied": return { cls: "bg-warning", label: "denied" };
    case "change_requested": return { cls: "bg-danger", label: "change requested" };
    default: return { cls: "bg-rule", label: "not reviewed" };
  }
}

export function BakeNav(props: Props) {
  return (
    <aside className="w-[280px] shrink-0 border-r border-rule hig-glass-edge flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-1">
        <button
          type="button"
          onClick={() => props.onSelect("epic")}
          className={entryClass(props.selectedId === "epic")}
        >
          <span className="flex items-center gap-2">
            <span className="flex-1 truncate">Epic overview</span>
            {props.finalizedIds.has("epic") && <span className="text-success text-hig-caption" aria-label="baked">✓</span>}
          </span>
        </button>
        <div className="mt-2 px-3 hig-section-label">Tasks</div>
        {props.tasks.map((t) => {
          const baked = props.finalizedIds.has(t.id);
          const failed = props.failedIds[t.id];
          const dot = statusDot(t.reviewStatus);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => props.onSelect(t.id)}
              className={entryClass(props.selectedId === t.id)}
            >
              <span className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full shrink-0 ${dot.cls}`} aria-label={dot.label} />
                <span className="flex-1 truncate">{t.title || "(untitled)"}</span>
                {t.reviewComment && t.reviewComment.trim().length > 0 && (
                  <span className="text-ink-secondary text-hig-caption" aria-label="has comment" title="Has a review comment">💬</span>
                )}
                {baked && <span className="text-success text-hig-caption" aria-label="baked">✓</span>}
                {failed && <span title={failed} className="text-danger text-hig-caption" aria-label="failed">⨯</span>}
              </span>
            </button>
          );
        })}
      </div>
      <div className="p-3 border-t border-rule flex flex-col gap-2">
        <Button variant="prominent" onClick={props.onUploadAll} disabled={props.uploadDisabled}>Upload all to Jira</Button>
        {props.uploadDisabled && (
          <p className="text-hig-footnote text-ink-secondary">
            You need to review all the tasks and resolve requested changes.
          </p>
        )}
        <Button variant="secondary" size="sm" onClick={props.onBackToEditing}>
          ← Back to editing
        </Button>
      </div>
    </aside>
  );
}
