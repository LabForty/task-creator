"use client";

import { Editor } from "@/components/Editor";
import { Button } from "@/components/ui/Button";
import { EpicTabBar } from "@/components/epic/EpicTabBar";
import { EpicTaskEditor } from "@/components/epic/EpicTaskEditor";
import type { EpicTask } from "@/lib/epic/tasks";

const NAMESPACE = "standalone";

type Props = {
  tasks: EpicTask[];
  active: "epic" | string;
  analyzing: boolean;
  analyzeProgress: string | null;
  refreshKey: number;
  onSelect: (tab: "epic" | string) => void;
  onAdd: () => void;
  onAnalyzeAll: () => void;
  onBake: () => void;
  onTitleChange: (id: string, title: string) => void;
  onSetLabels: (id: string, labels: string[]) => void;
  onAddLink: (blockerId: string, blockedId: string) => void;
  onRemoveLink: (blockerId: string, blockedId: string) => void;
  onDelete: (id: string) => void;
};

export function EpicTabs(props: Props) {
  const activeTask = props.active === "epic" ? null : props.tasks.find((t) => t.id === props.active) ?? null;

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <EpicTabBar
        tasks={props.tasks.map((t) => ({ id: t.id, title: t.title }))}
        active={props.active}
        onSelect={props.onSelect}
        onAdd={props.onAdd}
      />

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={props.onAnalyzeAll} disabled={props.analyzing || props.tasks.length === 0}>
          {props.analyzing ? "Analyzing…" : "Analyze all"}
        </Button>
        <Button type="button" size="sm" onClick={props.onBake} disabled={props.analyzing || props.tasks.length === 0}>Bake</Button>
        {props.analyzeProgress && <span className="text-hig-footnote text-ink-secondary">{props.analyzeProgress}</span>}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTask ? (
          <EpicTaskEditor
            taskId={activeTask.id}
            allTasks={props.tasks}
            labels={activeTask.labels}
            blocks={activeTask.blocks}
            blockedBy={activeTask.blockedBy}
            refreshKey={props.refreshKey}
            onTitleChange={(title) => props.onTitleChange(activeTask.id, title)}
            onSetLabels={(labels) => props.onSetLabels(activeTask.id, labels)}
            onAddLink={props.onAddLink}
            onRemoveLink={props.onRemoveLink}
            onDelete={() => props.onDelete(activeTask.id)}
          />
        ) : (
          // Epic tab — edit the epic/main task itself.
          <Editor key={`epic:${props.refreshKey}`} namespace={NAMESPACE} onFinalize={() => {}} hideSubmit />
        )}
      </div>
    </div>
  );
}
