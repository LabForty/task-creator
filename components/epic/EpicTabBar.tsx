"use client";

type TabTask = { id: string; title: string };
type Props = {
  tasks: TabTask[];
  active: "epic" | string;
  onSelect: (tab: "epic" | string) => void;
  onAdd: () => void;
};

export function EpicTabBar({ tasks, active, onSelect, onAdd }: Props) {
  const tabClass = (selected: boolean) =>
    `px-3 h-8 rounded-t-md text-hig-footnote whitespace-nowrap border-b-2 ${
      selected ? "border-accent text-ink font-medium" : "border-transparent text-ink-secondary hover:text-ink"
    }`;
  return (
    <div role="tablist" aria-label="Epic tasks" className="flex items-center gap-1 overflow-x-auto border-b border-rule">
      <button type="button" role="tab" aria-selected={active === "epic"} className={tabClass(active === "epic")} onClick={() => onSelect("epic")}>
        Epic
      </button>
      {tasks.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={active === t.id} className={tabClass(active === t.id)} onClick={() => onSelect(t.id)}>
          {t.title.trim() || "(untitled)"}
        </button>
      ))}
      <button type="button" aria-label="Add a task" className="px-2 h-8 text-ink-secondary hover:text-ink" onClick={onAdd}>
        ＋
      </button>
    </div>
  );
}
