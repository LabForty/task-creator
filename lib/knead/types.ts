// Shared kneading types. Pure types + constants only — no SDK, no React, so
// this module is safe to import from both server (lib/agent, routes) and
// client (components) code.

export type KneadAnswerValue = string | string[];

export type KneadQuestionType = "text" | "single" | "multi";
export type KneadSection = "business" | "technical";

export type KneadQuestion = {
  id: string;
  prompt: string;
  section: KneadSection;
  type: KneadQuestionType;
  options?: string[]; // present for "single" / "multi"
};

// One round of the interview plus the user's answers to it. The last round in
// KneadState.rounds is the one currently being answered while interviewing.
export type KneadRound = {
  questions: KneadQuestion[];
  answers: Record<string, KneadAnswerValue>;
  // Questions the user explicitly skipped — counted as resolved (so they don't
  // block kneading) but excluded from the answers sent to the AI.
  skipped?: string[];
};

export type KneadState = {
  status: "idle" | "interviewing" | "complete";
  rounds: KneadRound[];
  // The epic description captured when kneading first started this run. Used
  // to detect a later edit (lost-dough). Undefined until the first round.
  sourceDescription?: string;
};

// Raw, validated shape the model returns (before cap rules are applied).
export type KneadModelResult =
  | { kind: "questions"; questions: KneadQuestion[]; justification?: string }
  | { kind: "complete" };

// What /api/knead returns to the client after cap rules are applied.
export type KneadOutcome =
  | { kind: "questions"; round: { questions: KneadQuestion[] } }
  | { kind: "complete" }
  | { kind: "cap_reached"; justification: string };

export const MAX_QUESTIONS_PER_ROUND = 25;
export const MAX_FREE_ROUNDS = 5;
export const DEFAULT_CAP_JUSTIFICATION =
  "The AI needs more context to produce well-scoped sub-tasks.";

export const EMPTY_KNEAD: KneadState = { status: "idle", rounds: [] };
