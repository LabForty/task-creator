import type { Requirement, Story, GateResult } from "@/lib/pipeline";

export type RoleName = "analyst" | "planner";

export type FinalizedPayload = {
  requirement: Requirement;
  story: Story;
  gates: { schema: GateResult; consistency: GateResult };
  markdown: string;
  downloadUrls: { requirement: string; story: string; markdown: string };
};

export type MermaidFormat = "flow" | "sequence" | "interaction";

export type Diagrams = Partial<Record<MermaidFormat, string>>;

export type AnalyzeFinding = {
  id: string;
  severity: "info" | "warn" | "error";
  summary: string;
  proposedSync?: {
    acceptanceCriteria?: string[];
    mermaid?: Diagrams;
  };
};

export type HelpSuggestionKind = "missing_info" | "edge_case" | "alt_flow" | "mismatch";

export type HelpFieldHint = "title" | "description" | "acceptanceCriteria" | "constraints";

export type HelpSuggestion = {
  id: string;
  kind: HelpSuggestionKind;
  title: string;
  question: string;
  // Optional pointer to the draft field this suggestion is about. When set,
  // the UI flashes that field on "Discuss" so the user knows where to type.
  fieldHint?: HelpFieldHint;
};

export type HelpMessage =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; suggestions?: HelpSuggestion[] };

export type JobEvent =
  | { type: "role_started"; role: RoleName }
  | { type: "role_progress"; role: RoleName; message: string }
  | { type: "role_token"; role: RoleName; token: string }
  | { type: "gate_result"; gate: "schema" | "consistency"; ok: boolean; errors?: string[] }
  | { type: "role_finished"; role: RoleName; artifactId: string }
  | { type: "finalized"; payload: FinalizedPayload }
  | { type: "gates_failed"; payload: FinalizedPayload }
  | { type: "diagrams_created"; payload: Diagrams }
  | { type: "diagrams_analyzed"; payload: { findings: AnalyzeFinding[] } }
  | { type: "diagrams_applied"; payload: FinalizedPayload & { mermaid?: Diagrams } }
  | { type: "help_progress"; message: string }
  | { type: "help_message"; text: string }
  | { type: "help_done"; reason: "accepted" | "ignored" | "ended" }
  | { type: "error"; code: string; message: string; retriable: boolean };

export type JobStatus = "running" | "finalized" | "gates_failed" | "error";

export type JobState = {
  id: string;
  status: JobStatus;
  events: JobEvent[];
  result?: FinalizedPayload;
  error?: { code: string; message: string; retriable: boolean };
  createdAt: number;
};

export type EventListener = (event: JobEvent) => void;
