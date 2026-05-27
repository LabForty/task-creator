"use client";

import { useState } from "react";
import { TextArea } from "@/components/ui/TextField";
import type { KneadQuestion, KneadAnswerValue } from "@/lib/knead/types";

type Props = {
  question: KneadQuestion;
  value: KneadAnswerValue | undefined;
  onChange: (value: KneadAnswerValue) => void;
  disabled?: boolean;
};

const customInputClass =
  "w-full rounded-md bg-surface border border-rule text-hig-footnote text-ink placeholder:text-ink-tertiary h-8 px-2 focus:outline-none focus:border-accent focus:shadow-focus";

export function QuestionField({ question, value, onChange, disabled }: Props) {
  // Hoisted above the early returns so the hook order is stable; only the
  // "multi" branch uses it (the in-progress custom-value input).
  const [customDraft, setCustomDraft] = useState("");

  if (question.type === "text") {
    return (
      <TextArea
        label={question.prompt}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="min-h-[64px]"
      />
    );
  }

  if (question.type === "single") {
    const selected = typeof value === "string" ? value : "";
    const options = question.options ?? [];
    // A selected value that isn't one of the options is a custom answer.
    const custom = selected && !options.includes(selected) ? selected : "";
    return (
      <fieldset className="flex flex-col gap-1" disabled={disabled}>
        <legend className="text-hig-subhead font-medium text-ink mb-0.5">{question.prompt}</legend>
        {options.map((opt) => (
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
        <input
          type="text"
          aria-label={`Custom answer for ${question.prompt}`}
          value={custom}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Or write your own…"
          disabled={disabled}
          className={`mt-0.5 ${customInputClass}`}
        />
      </fieldset>
    );
  }

  // multi
  const selected = Array.isArray(value) ? value : [];
  const options = question.options ?? [];
  const customValues = selected.filter((v) => !options.includes(v));

  function addCustom() {
    const t = customDraft.trim();
    if (t && !selected.includes(t)) onChange([...selected, t]);
    setCustomDraft("");
  }

  return (
    <fieldset className="flex flex-col gap-1" disabled={disabled}>
      <legend className="text-hig-subhead font-medium text-ink mb-0.5">{question.prompt}</legend>
      {options.map((opt) => (
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
      {customValues.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {customValues.map((c) => (
            <span key={c} className="inline-flex items-center gap-1 rounded-full bg-surface-inset px-2 py-0.5 text-hig-footnote text-ink">
              {c}
              <button
                type="button"
                aria-label={`Remove ${c}`}
                onClick={() => onChange(selected.filter((o) => o !== c))}
                className="text-ink-tertiary hover:text-ink"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        aria-label={`Add a custom answer for ${question.prompt}`}
        value={customDraft}
        onChange={(e) => setCustomDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
        placeholder="Add your own…"
        disabled={disabled}
        className={`mt-0.5 ${customInputClass}`}
      />
    </fieldset>
  );
}
