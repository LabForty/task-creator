"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { MermaidDiagram } from "@/components/MermaidDiagram";

type Props = {
  source: string;
  onChange: (next: string) => void;
  onRegenerate?: () => void;
  regenerating?: boolean;
  /**
   * "preview-only" hides the source textarea by default and shows a large
   * Mermaid render full-width. The user can reveal the editor with the
   * "Edit source" toggle. Used for sequence / interaction diagrams.
   *
   * "split" shows source + preview side-by-side (legacy behaviour, still
   * used as the fallback when the flow editor can't parse the source).
   */
  layout?: "preview-only" | "split";
};

const DEBOUNCE_MS = 300;

export function DiagramEditor({
  source,
  onChange,
  onRegenerate,
  regenerating = false,
  layout = "split",
}: Props) {
  const [draft, setDraft] = useState(source);
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(source);
  }, [source]);

  useEffect(() => {
    if (draft === source) return;
    const t = window.setTimeout(() => onChange(draft), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [draft, source, onChange]);

  if (layout === "preview-only") {
    return (
      <div className="flex flex-col gap-2 h-full min-h-0">
        <div className="flex items-center gap-2 shrink-0">
          <span className="flex-1" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowSource((v) => !v)}
          >
            {showSource ? "Hide source" : "Edit source"}
          </Button>
          {onRegenerate && (
            <Button type="button" variant="ghost" size="sm" onClick={onRegenerate} disabled={regenerating}>
              {regenerating ? "Regenerating…" : "Regenerate"}
            </Button>
          )}
        </div>

        {showSource && (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            className={
              "p-3 rounded-md bg-surface-muted border border-rule " +
              "font-mono text-hig-footnote leading-relaxed text-ink min-h-[120px] " +
              "focus:outline-none focus:border-accent focus:shadow-focus " +
              "transition-all duration-150 ease-hig"
            }
            aria-label="Mermaid source"
          />
        )}

        <div className="flex-1 min-h-0 rounded-md bg-surface border border-rule p-3 overflow-auto">
          <MermaidDiagram source={draft} />
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2 h-full min-h-0">
      <div className="flex flex-col gap-2 min-h-0">
        <div className="flex items-center gap-2">
          <span className="text-hig-footnote font-medium text-ink-secondary uppercase tracking-wide">
            Mermaid source
          </span>
          <span className="flex-1" />
          {onRegenerate && (
            <Button variant="ghost" size="sm" onClick={onRegenerate} disabled={regenerating}>
              {regenerating ? "Regenerating…" : "Regenerate"}
            </Button>
          )}
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          className={
            "flex-1 min-h-[240px] p-3 rounded-md bg-surface-muted border border-rule " +
            "font-mono text-hig-footnote leading-relaxed text-ink " +
            "focus:outline-none focus:border-accent focus:shadow-focus " +
            "transition-all duration-150 ease-hig"
          }
          aria-label="Mermaid source"
        />
      </div>
      <div className="flex flex-col gap-2 min-h-0">
        <span className="text-hig-footnote font-medium text-ink-secondary uppercase tracking-wide">
          Preview
        </span>
        <div className="flex-1 rounded-md bg-surface border border-rule p-3 min-h-[240px] overflow-auto">
          <MermaidDiagram source={draft} />
        </div>
      </div>
    </div>
  );
}
