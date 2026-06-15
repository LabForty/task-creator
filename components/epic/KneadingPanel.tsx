"use client";

import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { QuestionField } from "@/components/epic/QuestionField";
import { currentRound, isCurrentRoundAnswered, isSkipped } from "@/lib/epic/state";
import type { KneadState, KneadAnswerValue, KneadSection } from "@/lib/knead/types";

type Props = {
  state: KneadState;
  loading: boolean;
  error: string | null;
  capPrompt: { justification: string } | null;
  onAnswer: (qid: string, value: KneadAnswerValue) => void;
  onSkip: (qid: string) => void;
  onUnskip: (qid: string) => void;
  onKnead: () => void;
  onApproveCap: () => void;
  onDeclineCap: () => void;
  onRetry: () => void;
  onGenerate?: () => void;
  generating?: boolean;
};

const SECTION_LABEL: Record<KneadSection, string> = { business: "Business", technical: "Technical" };

export function KneadingPanel({
  state, loading, error, capPrompt, onAnswer, onSkip, onUnskip, onKnead, onApproveCap, onDeclineCap, onRetry,
  onGenerate, generating = false,
}: Props) {
  const round = currentRound(state);

  return (
    <aside className="w-[380px] shrink-0 border-l border-rule bg-surface h-full overflow-y-auto p-4 flex flex-col gap-3">
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="text-hig-subhead font-semibold text-ink">
          {state.status === "complete" ? "Kneading complete" : "Refine the epic"}
        </h2>
        <span className="hig-section-label">Knead</span>
      </header>

      {error && (
        <Alert className="flex items-center gap-2">
          <p className="flex-1">{error}</p>
          <Button type="button" size="sm" variant="secondary" onClick={onRetry}>Retry</Button>
        </Alert>
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
          <Button
            type="button"
            onClick={onGenerate}
            disabled={!onGenerate || generating}
            title="Generate sub-tasks from the kneaded context"
          >
            {generating ? "Generating…" : "Generate sub-tasks"}
          </Button>
        </div>
      ) : (
        round && (
          <>
            {(["business", "technical"] as KneadSection[]).map((section) => {
              const sectionQs = round.questions.filter((q) => q.section === section);
              if (sectionQs.length === 0) return null;
              return (
                <div key={section} className="flex flex-col gap-2">
                  <h3 className="hig-section-label">{SECTION_LABEL[section]}</h3>
                  {sectionQs.map((q) =>
                    isSkipped(round, q.id) ? (
                      <div key={q.id} className="flex items-center justify-between gap-2 text-hig-footnote text-ink-tertiary">
                        <span className="line-through truncate">{q.prompt}</span>
                        <button type="button" className="shrink-0 text-accent hover:underline" onClick={() => onUnskip(q.id)}>
                          Undo
                        </button>
                      </div>
                    ) : (
                      <div key={q.id} className="flex flex-col gap-0.5">
                        <QuestionField
                          question={q}
                          value={round.answers[q.id]}
                          onChange={(v) => onAnswer(q.id, v)}
                          disabled={loading}
                        />
                        <button
                          type="button"
                          className="self-start text-hig-caption text-ink-tertiary hover:text-ink"
                          onClick={() => onSkip(q.id)}
                        >
                          Skip
                        </button>
                      </div>
                    ),
                  )}
                </div>
              );
            })}
            <Button
              type="button"
              onClick={onKnead}
              disabled={loading || !isCurrentRoundAnswered(state)}
              className="mt-1"
            >
              Knead
            </Button>
          </>
        )
      )}
    </aside>
  );
}
