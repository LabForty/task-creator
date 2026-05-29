"use client";

import { BakeNav } from "@/components/epic/bake/BakeNav";
import { BakeTaskPreview } from "@/components/epic/bake/BakeTaskPreview";
import { TaskGraph } from "@/components/epic/TaskGraph";
import type { EpicTask } from "@/lib/epic/tasks";
import type { AnalyzeFinding, Diagrams, FinalizedPayload, MermaidFormat } from "@/lib/jobs/types";

type Props = {
  tasks: EpicTask[];
  selectedId: "epic" | string;
  finalizedById: Record<string, FinalizedPayload>;
  finalizedEpic?: FinalizedPayload;
  diagramsById: Record<string, Diagrams | undefined>;
  failedIds: Record<string, string>;
  // Nav handlers
  onSelect: (id: "epic" | string) => void;
  onUploadAll: () => void;
  onBackToEditing: () => void;
  // Per-task Preview handlers — the parent threads them through with the
  // current selected id baked in (so we just pass them through unchanged).
  onCreateDiagrams: (id: string) => void;
  creatingForId: string | null;
  onEditDiagram: (id: string, format: MermaidFormat, source: string) => void;
  onRegenerateDiagram: (id: string, format: MermaidFormat) => void;
  regeneratingForId: string | null;
  regeneratingFormat: MermaidFormat | null;
  onAnalyzeDiagrams: (id: string) => void;
  analyzingForId: string | null;
  analysisFindings: Record<string, AnalyzeFinding[] | null>;
  onApplyAnalysis: (id: string, acceptedIds: string[]) => void;
  applyingForId: string | null;
  onDismissAnalysis: (id: string) => void;
  onMarkdownChange: (id: string, next: string) => void;
};

export function BakeView(props: Props) {
  const finalizedIds = new Set(Object.keys(props.finalizedById));
  const selectedTask = props.selectedId === "epic" ? null : props.tasks.find((t) => t.id === props.selectedId) ?? null;
  const selectedFinalized = selectedTask ? props.finalizedById[selectedTask.id] : undefined;

  return (
    <div className="flex-1 min-h-0 flex">
      <BakeNav
        tasks={props.tasks}
        selectedId={props.selectedId}
        finalizedIds={finalizedIds}
        failedIds={props.failedIds}
        onSelect={props.onSelect}
        onUploadAll={props.onUploadAll}
        onBackToEditing={props.onBackToEditing}
      />
      <div className="flex-1 min-w-0 overflow-y-auto">
        {!selectedTask ? (
          props.finalizedEpic ? (
            <BakeTaskPreview
              taskId="epic"
              finalized={props.finalizedEpic}
              diagrams={props.diagramsById["epic"]}
              onCreateDiagrams={() => props.onCreateDiagrams("epic")}
              creatingDiagrams={props.creatingForId === "epic"}
              onEditDiagram={(f, s) => props.onEditDiagram("epic", f, s)}
              onRegenerateDiagram={(f) => props.onRegenerateDiagram("epic", f)}
              regeneratingFormat={props.regeneratingForId === "epic" ? props.regeneratingFormat : null}
              onAnalyzeDiagrams={() => props.onAnalyzeDiagrams("epic")}
              analyzingDiagrams={props.analyzingForId === "epic"}
              analysisFindings={props.analysisFindings["epic"] ?? null}
              onApplyAnalysis={(ids) => props.onApplyAnalysis("epic", ids)}
              applyingAnalysis={props.applyingForId === "epic"}
              onDismissAnalysis={() => props.onDismissAnalysis("epic")}
              onMarkdownChange={(next) => props.onMarkdownChange("epic", next)}
            />
          ) : (
            <div className="p-6 max-w-4xl">
              <h2 className="text-hig-title3 mb-3">Epic overview</h2>
              <TaskGraph tasks={props.tasks} />
            </div>
          )
        ) : selectedFinalized ? (
          <BakeTaskPreview
            taskId={selectedTask.id}
            finalized={selectedFinalized}
            diagrams={props.diagramsById[selectedTask.id]}
            onCreateDiagrams={() => props.onCreateDiagrams(selectedTask.id)}
            creatingDiagrams={props.creatingForId === selectedTask.id}
            onEditDiagram={(f, s) => props.onEditDiagram(selectedTask.id, f, s)}
            onRegenerateDiagram={(f) => props.onRegenerateDiagram(selectedTask.id, f)}
            regeneratingFormat={props.regeneratingForId === selectedTask.id ? props.regeneratingFormat : null}
            onAnalyzeDiagrams={() => props.onAnalyzeDiagrams(selectedTask.id)}
            analyzingDiagrams={props.analyzingForId === selectedTask.id}
            analysisFindings={props.analysisFindings[selectedTask.id] ?? null}
            onApplyAnalysis={(ids) => props.onApplyAnalysis(selectedTask.id, ids)}
            applyingAnalysis={props.applyingForId === selectedTask.id}
            onDismissAnalysis={() => props.onDismissAnalysis(selectedTask.id)}
            onMarkdownChange={(next) => props.onMarkdownChange(selectedTask.id, next)}
          />
        ) : (
          <div className="p-6 text-hig-body text-ink-secondary">
            This task was not finalized (failed during bake). Go back to editing and re-bake.
          </div>
        )}
      </div>
    </div>
  );
}
