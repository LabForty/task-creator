"use client";

import { Button } from "@/components/ui/Button";
import { QuestionField } from "@/components/epic/QuestionField";
import { currentRound, isCurrentRoundAnswered } from "@/lib/epic/state";
import type { KneadState, KneadAnswerValue, KneadSection } from "@/lib/knead/types";

type Props = {
  state: KneadState;
  loading: boolean;
  error: string | null;
  capPrompt: { justification: string } | null;
  onAnswer: (qid: string, value: KneadAnswerValue) => void;
  onKnead: () => void;
  onApproveCap: () => void;
  onDeclineCap: () => void;
  onRetry: () => void;
};

const SECTION_LABEL: Record<KneadSection, string> = { business: "Business", technical: "Technical" };

export function KneadingPanel({
  state, loading, error, capPrompt, onAnswer, onKnead, onApproveCap, onDeclineCap, onRetry,
}: Props) {
  const round = currentRound(state);

  return (
    <aside className="w-[420px] shrink-0 border-l border-rule bg-surface h-full overflow-y-auto p-5 flex flex-col gap-4">
      <header className="flex flex-col gap-0.5">
        <span className="hig-section-label">Knead</span>
        <h2 className="text-hig-title3">
          {state.status === "complete" ? "Kneading complete" : "Refine the epic"}
        </h2>
      </header>

      {error && (
        <div className="rounded-md bg-danger/5 border border-danger/30 px-3 py-2 flex items-center gap-2" role="alert">
          <p className="text-hig-footnote text-danger flex-1">{error}</p>
          <Button type="button" size="sm" variant="secondary" onClick={onRetry}>Retry</Button>
        </div>
      )}

      {capPrompt && (
        <div className="rounded-md bg-warning-tint border border-warning/40 px-3 py-3 flex flex-col gap-2" role="alert">
          <p className="text-hig-footnote text-ink">
            The AI would like another round of questions: {capPrompt.justification}
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={onApproveCap}>Continue</Button>
            <Button type="button" size="sm" variant="secondary" onClick={onDeclineCap}>Stop here</Button>
          </div>
        </div>
      )}

      {loading && <p className="text-hig-footnote text-ink-secondary">Kneading…</p>}

      {state.status === "complete" ? (
        <div className="flex flex-col gap-3">
          <p className="text-hig-body text-ink-secondary">
            Context captured across {state.rounds.length} round{state.rounds.length === 1 ? "" : "s"}.
            Ready to turn into sub-tasks.
          </p>
          <Button type="button" disabled title="Sub-task generation arrives in SP2">
            Generate sub-tasks
          </Button>
        </div>
      ) : (
        round && (
          <>
            {(["business", "technical"] as KneadSection[]).map((section) => {
              const sectionQs = round.questions.filter((q) => q.section === section);
              if (sectionQs.length === 0) return null;
              return (
                <div key={section} className="flex flex-col gap-3">
                  <h3 className="hig-section-label">{SECTION_LABEL[section]}</h3>
                  {sectionQs.map((q) => (
                    <QuestionField
                      key={q.id}
                      question={q}
                      value={round.answers[q.id]}
                      onChange={(v) => onAnswer(q.id, v)}
                      disabled={loading}
                    />
                  ))}
                </div>
              );
            })}
            <Button
              type="button"
              onClick={onKnead}
              disabled={loading || !isCurrentRoundAnswered(state)}
              className="mt-2"
            >
              Knead
            </Button>
          </>
        )
      )}
    </aside>
  );
}
