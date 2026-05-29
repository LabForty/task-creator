"use client";

import { Preview } from "@/components/Preview";
import type { AnalyzeFinding, Diagrams, FinalizedPayload, MermaidFormat } from "@/lib/jobs/types";

type Props = {
  taskId: string;
  finalized: FinalizedPayload;
  diagrams?: Diagrams;
  onCreateDiagrams: () => void;
  creatingDiagrams: boolean;
  onEditDiagram: (format: MermaidFormat, source: string) => void;
  onRegenerateDiagram: (format: MermaidFormat) => void;
  regeneratingFormat: MermaidFormat | null;
  onAnalyzeDiagrams: () => void;
  analyzingDiagrams: boolean;
  analysisFindings: AnalyzeFinding[] | null;
  onApplyAnalysis: (acceptedIds: string[]) => void;
  applyingAnalysis: boolean;
  onDismissAnalysis: () => void;
  onMarkdownChange: (next: string) => void;
};

export function BakeTaskPreview(props: Props) {
  return (
    <Preview
      payload={props.finalized}
      diagrams={props.diagrams}
      onCreateDiagrams={props.onCreateDiagrams}
      creatingDiagrams={props.creatingDiagrams}
      onEditDiagram={props.onEditDiagram}
      onRegenerateDiagram={props.onRegenerateDiagram}
      regeneratingFormat={props.regeneratingFormat}
      onAnalyzeDiagrams={props.onAnalyzeDiagrams}
      analyzingDiagrams={props.analyzingDiagrams}
      analysisFindings={props.analysisFindings}
      onApplyAnalysis={props.onApplyAnalysis}
      applyingAnalysis={props.applyingAnalysis}
      onDismissAnalysis={props.onDismissAnalysis}
      onMarkdownChange={props.onMarkdownChange}
      // No onHelp (per-task diagrams Help is out of scope for v1).
      // No jiraConnected/onExportToJira (per-task export is out of scope; batch only).
    />
  );
}
