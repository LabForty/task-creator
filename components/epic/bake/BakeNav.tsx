"use client";

import { Button } from "@/components/ui/Button";
import type { EpicTask } from "@/lib/epic/tasks";

type Props = {
  tasks: EpicTask[];
  selectedId: "epic" | string;
  finalizedIds: Set<string>;
  failedIds: Record<string, string>;
  onSelect: (id: "epic" | string) => void;
  onUploadAll: () => void;
  onBackToEditing: () => void;
};

function entryClass(active: boolean): string {
  return (
    "w-full text-left px-3 py-2 rounded-md text-hig-body transition-colors " +
    (active ? "bg-accent-tint text-accent font-medium" : "text-ink hover:bg-surface-muted")
  );
}

export function BakeNav(props: Props) {
  return (
    <aside className="w-[280px] shrink-0 border-r border-rule bg-surface flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-1">
        <button
          type="button"
          onClick={() => props.onSelect("epic")}
          className={entryClass(props.selectedId === "epic")}
        >
          <span className="flex items-center gap-2">
            <span className="flex-1 truncate">Epic overview</span>
            {props.finalizedIds.has("epic") && <span className="text-success text-[12px]" aria-label="baked">✓</span>}
          </span>
        </button>
        <div className="mt-2 px-3 hig-section-label">Tasks</div>
        {props.tasks.map((t) => {
          const baked = props.finalizedIds.has(t.id);
          const failed = props.failedIds[t.id];
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => props.onSelect(t.id)}
              className={entryClass(props.selectedId === t.id)}
            >
              <span className="flex items-center gap-2">
                <span className="flex-1 truncate">{t.title || "(untitled)"}</span>
                {baked && <span className="text-success text-[12px]" aria-label="baked">✓</span>}
                {failed && <span title={failed} className="text-danger text-[12px]" aria-label="failed">⨯</span>}
              </span>
            </button>
          );
        })}
      </div>
      <div className="p-3 border-t border-rule flex flex-col gap-2">
        <Button onClick={props.onUploadAll}>Upload all to Jira</Button>
        <Button variant="secondary" size="sm" onClick={props.onBackToEditing}>
          ← Back to editing
        </Button>
      </div>
    </aside>
  );
}
