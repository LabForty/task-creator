"use client";

import { Editor } from "@/components/Editor";
import { Button } from "@/components/ui/Button";
import { BackBar } from "@/components/epic/BackBar";
import { EpicTaskCards } from "@/components/epic/EpicTaskCards";
import { EpicTaskEditor } from "@/components/epic/EpicTaskEditor";
import type { EpicTask } from "@/lib/epic/tasks";

const NAMESPACE = "standalone";

type BakeState = "pending" | "baking" | "baked" | "failed";

type Props = {
  // Epic identity for the Epic card
  epicTitle: string;
  epicDescriptionHtml: string;
  tasks: EpicTask[];
  activeId: "epic" | string;
  refreshKey: number;
  // Bake state passed through to the cards
  bakeStatus: "idle" | "baking" | "baked";
  bakeProgress: Record<string, BakeState>;
  bakeErrors: Record<string, string>;
  bakeDone: number;
  bakeTotal: number;
  // Whether the third (HelpPanel) column is present — the parent renders the
  // HelpPanel itself; this prop only lets us narrow the cards column when
  // analyze is open. Parent passes true iff analyzeTaskId is set.
  analyzePanelOpen?: boolean;
  // Card handlers
  onSelectCard: (id: "epic" | string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onCancelBake: () => void;
  // Toolbar handlers
  onBack: () => void;
  onAnalyzeAll: () => void;
  onBake: () => void;
  // Per-task editor handlers (forwarded to EpicTaskEditor)
  onTitleChange: (id: string, title: string) => void;
  onSetLabels: (id: string, labels: string[]) => void;
  onAddLink: (blockerId: string, blockedId: string) => void;
  onRemoveLink: (blockerId: string, blockedId: string) => void;
  onClearTask: (id: "epic" | string) => void;
  descriptionPreviewsById?: Record<string, string>;
  taskTypesById?: Record<string, string>;
  acCountsById?: Record<string, number>;
};

function stripHtml(html: string): string {
  const text = (html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > 80 ? text.slice(0, 79) + "…" : text;
}

export function EpicEditingView(props: Props) {
  const activeTask = props.activeId === "epic" ? null : props.tasks.find((t) => t.id === props.activeId) ?? null;
  const baking = props.bakeStatus === "baking";
  const cardsCols = props.analyzePanelOpen
    ? "flex-[0.6] min-w-[340px] max-w-[420px] shrink-0 transition-[flex-basis,max-width,min-width] duration-150 ease-out"
    : "flex-[0.8] min-w-[400px] max-w-[560px] shrink-0 transition-[flex-basis,max-width,min-width] duration-150 ease-out";

  return (
    <div className="flex flex-col gap-3 h-full min-h-0 px-6 py-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 shrink-0">
        <BackBar
          label="Back to kneading"
          confirmMessage="This will clear the current sub-tasks and per-task drafts."
          onBack={props.onBack}
        />
        <span className="flex-1" />
        <Button type="button" size="sm" variant="secondary" onClick={props.onAnalyzeAll} disabled={baking || props.tasks.length === 0}>
          Analyze all
        </Button>
        <Button type="button" size="sm" variant="prominent" onClick={props.onBake} disabled={baking || props.tasks.length === 0}>
          Bake
        </Button>
      </div>

      {/* Body: editor (capped) + cards (flexible) + HelpPanel slot is rendered by the parent as a sibling next to this whole view */}
      <div className={"flex-1 min-h-0 flex gap-4 " + (baking ? "[&_form]:pointer-events-none [&_form]:opacity-60" : "")}>
        {/* Editor pane — fills its column from the left, no centering cap. */}
        <div className="flex-1 min-w-0 overflow-y-auto transition-[flex-basis] duration-150 ease-out">
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
              onClear={() => props.onClearTask(activeTask.id)}
            />
          ) : (
            <Editor
              key={`epic:${props.refreshKey}`}
              namespace={NAMESPACE}
              onFinalize={() => {}}
              hideSubmit
              taskTypeLocked="epic"
              onClear={() => props.onClearTask("epic")}
            />
          )}
        </div>

        {/* Cards column */}
        <div className={cardsCols + " border-l border-rule pl-2"}>
          <EpicTaskCards
            epicTitle={props.epicTitle}
            epicDescriptionPreview={stripHtml(props.epicDescriptionHtml)}
            tasks={props.tasks}
            activeId={props.activeId}
            bakeStatus={props.bakeStatus}
            bakeProgress={props.bakeProgress}
            bakeErrors={props.bakeErrors}
            bakeDone={props.bakeDone}
            bakeTotal={props.bakeTotal}
            onSelect={props.onSelectCard}
            onAdd={props.onAdd}
            onDelete={props.onDelete}
            onCancelBake={props.onCancelBake}
            descriptionPreviewsById={props.descriptionPreviewsById}
            taskTypesById={props.taskTypesById}
            acCountsById={props.acCountsById}
          />
        </div>

        {/* HelpPanel slot: the parent renders the HelpPanel as a sibling of this
            view in the outer layout. We don't render it here so it can survive
            mount/unmount transitions and keep its own state. The analyzePanelOpen
            prop is used only to size the cards column. */}
      </div>
    </div>
  );
}
