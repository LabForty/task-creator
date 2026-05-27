"use client";

import type { SubTask } from "@/lib/subtasks/types";

type Props = {
  subtask: SubTask;
  allSubtasks: SubTask[];
  onAddLink: (blockerId: string, blockedId: string) => void;
  onRemoveLink: (blockerId: string, blockedId: string) => void;
};

export function SubtaskLinksField({ subtask, allSubtasks, onAddLink, onRemoveLink }: Props) {
  const titleOf = (id: string) => allSubtasks.find((s) => s.id === id)?.title || "(untitled)";
  const others = allSubtasks.filter((s) => s.id !== subtask.id);
  const blocksOptions = others.filter((s) => !subtask.blocks.includes(s.id));
  const blockedByOptions = others.filter((s) => !subtask.blockedBy.includes(s.id));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <span className="text-hig-footnote text-ink-secondary">Blocks:</span>
        <div className="flex flex-wrap gap-1.5">
          {subtask.blocks.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-surface-inset px-2 py-0.5 text-hig-footnote text-ink">
              {titleOf(id)}
              <button type="button" aria-label={`Remove blocks ${titleOf(id)}`} onClick={() => onRemoveLink(subtask.id, id)} className="text-ink-tertiary hover:text-ink">×</button>
            </span>
          ))}
        </div>
        <select
          aria-label="Add a sub-task this blocks"
          value=""
          onChange={(e) => { if (e.target.value) onAddLink(subtask.id, e.target.value); }}
          className="h-8 rounded-md bg-surface border border-rule text-hig-footnote text-ink px-2"
        >
          <option value="">Add…</option>
          {blocksOptions.map((s) => (<option key={s.id} value={s.id}>{s.title || "(untitled)"}</option>))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-hig-footnote text-ink-secondary">Blocked by:</span>
        <div className="flex flex-wrap gap-1.5">
          {subtask.blockedBy.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-surface-inset px-2 py-0.5 text-hig-footnote text-ink">
              {titleOf(id)}
              <button type="button" aria-label={`Remove blocked-by ${titleOf(id)}`} onClick={() => onRemoveLink(id, subtask.id)} className="text-ink-tertiary hover:text-ink">×</button>
            </span>
          ))}
        </div>
        <select
          aria-label="Add a sub-task that blocks this"
          value=""
          onChange={(e) => { if (e.target.value) onAddLink(e.target.value, subtask.id); }}
          className="h-8 rounded-md bg-surface border border-rule text-hig-footnote text-ink px-2"
        >
          <option value="">Add…</option>
          {blockedByOptions.map((s) => (<option key={s.id} value={s.id}>{s.title || "(untitled)"}</option>))}
        </select>
      </div>
    </div>
  );
}
