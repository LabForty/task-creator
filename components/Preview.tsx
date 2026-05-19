"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { openJiraConnectPopup } from "@/components/JiraChip";
import { DiagramView } from "@/components/DiagramView";
import { AnalyzePanel } from "@/components/AnalyzePanel";
import type { AnalyzeFinding, Diagrams, FinalizedPayload, MermaidFormat } from "@/lib/jobs/types";

type Props = {
  payload: FinalizedPayload;
  diagrams?: Diagrams;
  onCreateDiagrams?: () => void;
  creatingDiagrams?: boolean;
  onEditDiagram?: (format: MermaidFormat, source: string) => void;
  onRegenerateDiagram?: (format: MermaidFormat) => void;
  regeneratingFormat?: MermaidFormat | null;
  onAnalyzeDiagrams?: () => void;
  analyzingDiagrams?: boolean;
  analysisFindings?: AnalyzeFinding[] | null;
  onApplyAnalysis?: (acceptedIds: string[]) => void;
  applyingAnalysis?: boolean;
  onDismissAnalysis?: () => void;
  onHelp?: () => void;
  onMarkdownChange?: (next: string) => void;
  jiraConnected?: boolean;
  jiraConfigured?: boolean;
  onExportToJira?: () => void;
};

export function Preview({
  payload,
  diagrams,
  onCreateDiagrams,
  creatingDiagrams,
  onEditDiagram,
  onRegenerateDiagram,
  regeneratingFormat,
  onAnalyzeDiagrams,
  analyzingDiagrams,
  analysisFindings,
  onApplyAnalysis,
  applyingAnalysis,
  onDismissAnalysis,
  onHelp,
  onMarkdownChange,
  jiraConnected,
  jiraConfigured,
  onExportToJira,
}: Props) {
  const { story, markdown, gates } = payload;
  const gatesOk = gates.schema.ok && gates.consistency.ok;

  // Build a Blob URL each render. cheap; user-visible only when they click.
  const markdownHref = useMemo(() => {
    if (typeof window === "undefined") return "#";
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    return URL.createObjectURL(blob);
  }, [markdown]);

  const hasFindings = analysisFindings !== null && analysisFindings !== undefined;

  return (
    <section
      aria-label="Finalized result"
      className="flex flex-col h-full min-h-0 overflow-hidden"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 px-6 py-4 flex-1 min-h-0 overflow-hidden">
        {/* LEFT: output (editable markdown) */}
        <div className="hig-card p-5 flex flex-col gap-3 min-h-0 overflow-hidden">
          <header className="flex items-start flex-wrap gap-3 shrink-0">
            <div className="flex flex-col min-w-0">
              <span className="hig-section-label">Finalized</span>
              <h2 className="text-hig-title3 truncate">{story.title}</h2>
            </div>
            <span className="flex-1" />
            {jiraConfigured && (
              jiraConnected ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onExportToJira}
                  disabled={!gatesOk || !onExportToJira}
                  title={!gatesOk ? "Fix validation issues first" : "Create a Jira issue from this task"}
                >
                  Export to Jira
                </Button>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => openJiraConnectPopup()}>
                  Connect to Jira
                </Button>
              )
            )}
            <a href={markdownHref} download="finalized.md">
              <Button variant="secondary" size="sm">
                Download .md
              </Button>
            </a>
          </header>

          {!gatesOk && (
            <div className="rounded-md bg-warning/10 border border-warning/40 px-3 py-2 shrink-0">
              <p className="text-hig-footnote text-ink">
                <strong className="font-semibold">Heads up:</strong> something didn&apos;t validate.
                Edit the markdown below, or hit <em>Edit / start over</em> to revise the draft.
              </p>
            </div>
          )}

          <textarea
            value={markdown}
            onChange={(e) => onMarkdownChange?.(e.target.value)}
            spellCheck={false}
            className={
              "flex-1 min-h-0 p-4 rounded-md bg-surface-muted border border-rule " +
              "text-hig-footnote font-sans leading-relaxed text-ink whitespace-pre-wrap " +
              "focus:outline-none focus:border-accent focus:shadow-focus " +
              "transition-all duration-150 ease-hig resize-none"
            }
            aria-label="Finalized markdown — editable"
          />
        </div>

        {/* RIGHT: diagram */}
        <div className="hig-card flex flex-col gap-3 min-h-0 overflow-hidden p-5">
          <header className="flex items-start flex-wrap gap-2 shrink-0">
            <div className="flex flex-col">
              <span className="hig-section-label">Diagrams</span>
              <h3 className="text-hig-title3">Behavior &amp; flows</h3>
            </div>
            <span className="flex-1" />
            {onCreateDiagrams && !diagrams && (
              <Button size="sm" onClick={onCreateDiagrams} disabled={creatingDiagrams || !gatesOk}>
                {creatingDiagrams ? "Creating…" : "Create diagrams"}
              </Button>
            )}
            {onAnalyzeDiagrams && diagrams && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onAnalyzeDiagrams}
                disabled={analyzingDiagrams || !gatesOk}
              >
                {analyzingDiagrams ? "Analyzing…" : "Analyze"}
              </Button>
            )}
            {onHelp && diagrams && (
              <Button variant="ghost" size="sm" onClick={onHelp}>
                Help
              </Button>
            )}
          </header>

          <div className="flex-1 min-h-0 overflow-auto">
            {!diagrams && !creatingDiagrams && (
              <div className="rounded-md bg-surface-muted p-6 h-full flex items-center justify-center">
                <p className="text-hig-footnote text-ink-secondary text-center">
                  No diagrams yet. Click <strong className="font-semibold">Create diagrams</strong>{" "}
                  to generate the flow / sequence / interaction views.
                </p>
              </div>
            )}

            {creatingDiagrams && !diagrams && (
              <div className="rounded-md bg-surface-muted p-6 h-full flex flex-col items-center justify-center gap-2" aria-live="polite">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
                  <span className="text-hig-subhead font-medium">Creating three diagrams…</span>
                </div>
                <p className="text-hig-footnote text-ink-secondary text-center max-w-md">
                  Flow, sequence, and actor interaction views — focused on user-facing behaviour,
                  not implementation detail.
                </p>
              </div>
            )}

            {diagrams && (
              <DiagramView
                diagrams={diagrams}
                onEdit={onEditDiagram ?? (() => {})}
                onRegenerate={onRegenerateDiagram}
                regeneratingFormat={regeneratingFormat}
              />
            )}

            {analyzingDiagrams && (
              <div className="mt-4 rounded-md bg-surface-muted p-4" aria-live="polite">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
                  <span className="text-hig-subhead font-medium">Analyzing diagrams…</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {hasFindings && onApplyAnalysis && onDismissAnalysis && (
        <div className="px-6 pb-4 shrink-0">
          <AnalyzePanel
            findings={analysisFindings!}
            onApply={onApplyAnalysis}
            onDismiss={onDismissAnalysis}
            applying={applyingAnalysis}
          />
        </div>
      )}
    </section>
  );
}
