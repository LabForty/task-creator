"use client";

import { isAnswered } from "@/lib/epic/state";
import type { KneadRound, KneadAnswerValue } from "@/lib/knead/types";

function formatAnswer(value: KneadAnswerValue): string {
  return Array.isArray(value) ? value.join(", ") : value;
}

type Props = { rounds: KneadRound[] };

export function CapturedContext({ rounds }: Props) {
  const answered = rounds.flatMap((round) =>
    round.questions
      .filter((q) => isAnswered(q, round.answers[q.id]))
      .map((q) => ({ id: q.id, prompt: q.prompt, answer: formatAnswer(round.answers[q.id]) })),
  );

  if (answered.length === 0) return null;

  return (
    <section aria-label="Captured context" className="mt-4 flex flex-col gap-2">
      <h3 className="hig-section-label">Captured context</h3>
      <ul className="flex flex-col gap-2">
        {answered.map((item) => (
          <li key={item.id} className="border-l-2 border-accent/40 bg-accent-tint/40 rounded-r-md px-3 py-1.5">
            <p className="text-hig-footnote font-medium text-ink-secondary">{item.prompt}</p>
            <p className="text-hig-body text-ink">{item.answer}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
