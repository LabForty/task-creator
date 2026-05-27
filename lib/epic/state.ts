import {
  type KneadState, type KneadQuestion, type KneadAnswerValue,
  type KneadRound, EMPTY_KNEAD,
} from "@/lib/knead/types";

export function isAnswered(q: KneadQuestion, value: KneadAnswerValue | undefined): boolean {
  if (value === undefined) return false;
  if (q.type === "multi") return Array.isArray(value) && value.length > 0;
  return typeof value === "string" && value.trim().length > 0;
}

export function currentRound(state: KneadState): KneadRound | undefined {
  return state.rounds[state.rounds.length - 1];
}

export function startInterview(_state: KneadState, sourceDescription: string): KneadState {
  return { status: "interviewing", rounds: [], sourceDescription };
}

export function appendRound(state: KneadState, questions: KneadQuestion[]): KneadState {
  return {
    ...state,
    status: "interviewing",
    rounds: [...state.rounds, { questions, answers: {} }],
  };
}

export function setAnswer(state: KneadState, qid: string, value: KneadAnswerValue): KneadState {
  const last = state.rounds.length - 1;
  if (last < 0) return state;
  const rounds = state.rounds.map((r, i) =>
    i === last ? { ...r, answers: { ...r.answers, [qid]: value } } : r,
  );
  return { ...state, rounds };
}

export function isCurrentRoundAnswered(state: KneadState): boolean {
  const round = currentRound(state);
  if (!round || round.questions.length === 0) return false;
  return round.questions.every((q) => isAnswered(q, round.answers[q.id]));
}

export function markComplete(state: KneadState): KneadState {
  return { ...state, status: "complete" };
}

// keepAnswers=true preserves prior rounds so the next run can be seeded with
// them; false discards all dough. Either way we return to idle so the left-pane
// "Knead tasks" button drives the next run.
export function resetDough(state: KneadState, keepAnswers: boolean): KneadState {
  if (!keepAnswers) return { ...EMPTY_KNEAD };
  // Copy the array so the returned state shares no mutable structure with the
  // input — keeps every helper uniformly immutable.
  return { status: "idle", rounds: [...state.rounds], sourceDescription: undefined };
}
