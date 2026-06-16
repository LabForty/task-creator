"use client";

import { useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
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

// Tiny GhostDiagram-vocabulary sketches (faint currentColor strokes, rounded
// rects + edges) characterising each diagram type. Decorative + aria-hidden;
// shown only on hover of the matching segment.
const TYPE_SKETCH: Record<MermaidFormat, ReactNode> = {
  // Flow: a horizontal chain of boxes joined by arrows.
  flow: (
    <g stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
      <rect x="6" y="16" width="20" height="16" rx="4" />
      <rect x="44" y="16" width="20" height="16" rx="4" />
      <rect x="82" y="16" width="20" height="16" rx="4" />
      <path d="M26 24 H44 M64 24 H82" />
    </g>
  ),
  // Sequence: vertical lifelines crossed by horizontal messages.
  sequence: (
    <g stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
      <rect x="14" y="6" width="16" height="10" rx="3" />
      <rect x="78" y="6" width="16" height="10" rx="3" />
      <path d="M22 16 V44 M86 16 V44" />
      <path d="M22 26 H86 M86 36 H22" />
    </g>
  ),
  // Interaction: two actor nodes linked by an edge with a relay box.
  interaction: (
    <g stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
      <circle cx="16" cy="24" r="9" />
      <circle cx="92" cy="24" r="9" />
      <rect x="44" y="15" width="20" height="18" rx="4" />
      <path d="M25 24 H44 M64 24 H83" />
    </g>
  ),
};

export function DiagramView({ diagrams, onEdit, onRegenerate, regeneratingFormat }: Props) {
  const available = ORDER.filter((f) => diagrams[f] !== undefined);
  const [active, setActive] = useState<MermaidFormat | null>(available[0] ?? null);
  // For the flow format, prefer the graphical editor but let the user fall
  // back to the text editor if they need raw Mermaid syntax.
  const [flowMode, setFlowMode] = useState<"graph" | "text">("graph");
  // Hover preview: which segment is hovered + where to anchor the thumbnail.
  // Measured at pointer-event time (never reading refs during render).
  const [preview, setPreview] = useState<{ format: MermaidFormat; left: number } | null>(null);

  // Delegated hover detection over the SegmentedControl (reused unmodified).
  // Resolve the hovered `[role="tab"]` to its diagram format by index, then
  // anchor the floating thumbnail to the segment's horizontal centre.
  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const tab = (e.target as Element).closest('[role="tab"]');
    if (!tab) {
      setPreview(null);
      return;
    }
    const tabs = Array.from(e.currentTarget.querySelectorAll('[role="tab"]'));
    const index = tabs.indexOf(tab);
    const format = available[index];
    if (!format) {
      setPreview(null);
      return;
    }
    const wrapRect = e.currentTarget.getBoundingClientRect();
    const tabRect = (tab as HTMLElement).getBoundingClientRect();
    const left = tabRect.left - wrapRect.left + tabRect.width / 2;
    setPreview((prev) =>
      prev && prev.format === format && prev.left === left ? prev : { format, left },
    );
  }

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
        {/* Anchor for the hover thumbnail. Pointer handlers are delegated here
            so SegmentedControl stays untouched; the preview is purely
            decorative (aria-hidden + pointer-events-none). */}
        <div
          className="relative"
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setPreview(null)}
        >
          <SegmentedControl<MermaidFormat>
            value={current}
            onChange={(v) => setActive(v)}
            ariaLabel="Diagram format"
            items={available.map((f) => ({ value: f, label: FORMAT_LABEL[f] }))}
          />
          {preview && (
            // No transition: shows/hides instantly, so it reads identically
            // under prefers-reduced-motion (nothing to guard) and stays subtle.
            <div
              aria-hidden
              className="pointer-events-none absolute top-full z-10 mt-2 -translate-x-1/2 rounded-md border border-rule bg-surface p-1.5 shadow-card text-ink-quaternary"
              style={{ left: preview.left }}
            >
              <svg viewBox="0 0 108 48" width="72" height="32" fill="none" aria-hidden>
                {TYPE_SKETCH[preview.format]}
              </svg>
            </div>
          )}
        </div>
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
