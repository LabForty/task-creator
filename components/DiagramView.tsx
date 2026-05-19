"use client";

import { useState } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { DiagramEditor } from "@/components/DiagramEditor";
import { FlowGraphEditor } from "@/components/FlowGraphEditor";
import { Button } from "@/components/ui/Button";
import type { Diagrams, MermaidFormat } from "@/lib/jobs/types";

type Props = {
  diagrams: Diagrams;
  onEdit: (format: MermaidFormat, source: string) => void;
  onRegenerate?: (format: MermaidFormat) => void;
  regeneratingFormat?: MermaidFormat | null;
};

const FORMAT_LABEL: Record<MermaidFormat, string> = {
  flow: "Flow",
  sequence: "Sequence",
  interaction: "Interaction",
};

const ORDER: MermaidFormat[] = ["flow", "sequence", "interaction"];

export function DiagramView({ diagrams, onEdit, onRegenerate, regeneratingFormat }: Props) {
  const available = ORDER.filter((f) => diagrams[f] !== undefined);
  const [active, setActive] = useState<MermaidFormat | null>(available[0] ?? null);
  // For the flow format, prefer the graphical editor but let the user fall
  // back to the text editor if they need raw Mermaid syntax.
  const [flowMode, setFlowMode] = useState<"graph" | "text">("graph");

  if (available.length === 0) {
    return (
      <div className="text-hig-footnote text-ink-secondary">
        No diagrams produced — usually because the task description is too small to model.
      </div>
    );
  }

  const current: MermaidFormat = active && diagrams[active] !== undefined ? active : available[0];

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="flex items-center flex-wrap gap-2 shrink-0">
        <SegmentedControl<MermaidFormat>
          value={current}
          onChange={(v) => setActive(v)}
          ariaLabel="Diagram format"
          items={available.map((f) => ({ value: f, label: FORMAT_LABEL[f] }))}
        />
        <span className="flex-1" />
        {current === "flow" && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setFlowMode("graph")}
              className={
                "h-7 px-2.5 rounded-md text-hig-caption font-medium border " +
                (flowMode === "graph"
                  ? "bg-accent text-white border-accent"
                  : "bg-surface text-ink border-rule hover:bg-surface-muted")
              }
            >
              Graph
            </button>
            <button
              type="button"
              onClick={() => setFlowMode("text")}
              className={
                "h-7 px-2.5 rounded-md text-hig-caption font-medium border " +
                (flowMode === "text"
                  ? "bg-accent text-white border-accent"
                  : "bg-surface text-ink border-rule hover:bg-surface-muted")
              }
            >
              Source
            </button>
          </div>
        )}
        {onRegenerate && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRegenerate(current)}
            disabled={regeneratingFormat === current}
          >
            {regeneratingFormat === current ? "Regenerating…" : "Regenerate"}
          </Button>
        )}
      </div>

      <div className="flex-1 min-h-0">
        {current === "flow" && flowMode === "graph" ? (
          <FlowGraphEditor
            key={current}
            source={diagrams[current] ?? ""}
            onChange={(next) => onEdit(current, next)}
          />
        ) : (
          <DiagramEditor
            key={`${current}-text`}
            source={diagrams[current] ?? ""}
            onChange={(next) => onEdit(current, next)}
            layout={current === "flow" ? "split" : "preview-only"}
          />
        )}
      </div>
    </div>
  );
}
