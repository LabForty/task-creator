"use client";

import { Editor } from "@/components/Editor";
import { Button } from "@/components/ui/Button";
import { EpicTabBar } from "@/components/epic/EpicTabBar";
import { EpicTaskEditor } from "@/components/epic/EpicTaskEditor";
import { BackBar } from "@/components/epic/BackBar";
import type { EpicTask } from "@/lib/epic/tasks";

const NAMESPACE = "standalone";

type Props = {
  tasks: EpicTask[];
  active: "epic" | string;
  refreshKey: number;
  onSelect: (tab: "epic" | string) => void;
  onAdd: () => void;
  onAnalyzeAll: () => void;
  onAnalyzeTask: (taskId: string) => void;
  onBake: () => void;
  onBack: () => void;
  onTitleChange: (id: string, title: string) => void;
  onSetLabels: (id: string, labels: string[]) => void;
  onAddLink: (blockerId: string, blockedId: string) => void;
  onRemoveLink: (blockerId: string, blockedId: string) => void;
  onDelete: (id: string) => void;
  onClearTask: (id: string) => void;
};

export function EpicTabs(props: Props) {
  const activeTask = props.active === "epic" ? null : props.tasks.find((t) => t.id === props.active) ?? null;

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <BackBar
        label="Back to kneading"
        confirmMessage="This will clear the current sub-tasks and per-task drafts."
        onBack={props.onBack}
      />

      <EpicTabBar
        tasks={props.tasks.map((t) => ({ id: t.id, title: t.title }))}
        active={props.active}
        onSelect={props.onSelect}
        onAdd={props.onAdd}
      />

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={props.onAnalyzeAll} disabled={props.tasks.length === 0}>
          Analyze all
        </Button>
        <Button type="button" size="sm" onClick={props.onBake} disabled={props.tasks.length === 0}>
          Bake
        </Button>
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
            onAnalyze={() => props.onAnalyzeTask(activeTask.id)}
            onClear={() => props.onClearTask(activeTask.id)}
          />
        ) : (
          // Epic tab — edit the epic/main task itself; Clear targets the standalone draft.
          <Editor
            key={`epic:${props.refreshKey}`}
            namespace={NAMESPACE}
            onFinalize={() => {}}
            hideSubmit
            onClear={() => props.onClearTask("epic")}
          />
        )}
      </div>
    </div>
  );
}
