"use client";

import { TextArea } from "@/components/ui/TextField";
import type { KneadQuestion, KneadAnswerValue } from "@/lib/knead/types";

type Props = {
  question: KneadQuestion;
  value: KneadAnswerValue | undefined;
  onChange: (value: KneadAnswerValue) => void;
  disabled?: boolean;
};

export function QuestionField({ question, value, onChange, disabled }: Props) {
  if (question.type === "text") {
    return (
      <TextArea
        label={question.prompt}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="min-h-[72px]"
      />
    );
  }

  if (question.type === "single") {
    const selected = typeof value === "string" ? value : "";
    return (
      <fieldset className="flex flex-col gap-1.5" disabled={disabled}>
        <legend className="text-hig-subhead font-medium text-ink mb-1">{question.prompt}</legend>
        {(question.options ?? []).map((opt) => (
          <label key={opt} className="flex items-center gap-2 text-hig-body text-ink">
            <input
              type="radio"
              name={question.id}
              value={opt}
              checked={selected === opt}
              onChange={() => onChange(opt)}
              className="accent-accent"
            />
            {opt}
          </label>
        ))}
      </fieldset>
    );
  }

  // multi
  const selected = Array.isArray(value) ? value : [];
  return (
    <fieldset className="flex flex-col gap-1.5" disabled={disabled}>
      <legend className="text-hig-subhead font-medium text-ink mb-1">{question.prompt}</legend>
      {(question.options ?? []).map((opt) => (
        <label key={opt} className="flex items-center gap-2 text-hig-body text-ink">
          <input
            type="checkbox"
            value={opt}
            checked={selected.includes(opt)}
            onChange={(e) =>
              onChange(e.target.checked ? [...selected, opt] : selected.filter((o) => o !== opt))
            }
            className="accent-accent"
          />
          {opt}
        </label>
      ))}
    </fieldset>
  );
}
