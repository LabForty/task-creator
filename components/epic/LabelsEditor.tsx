"use client";

import { useState } from "react";
import { dedupeLabels } from "@/lib/jira/metadata";

type Props = { value: string[]; onChange: (next: string[]) => void; disabled?: boolean };

export function LabelsEditor({ value, onChange, disabled }: Props) {
  const [input, setInput] = useState("");

  function add() {
    const trimmed = input.trim();
    if (!trimmed) return;
    const next = dedupeLabels([...value, trimmed]);
    if (next.length !== value.length) onChange(next);
    setInput("");
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-hig-subhead font-medium text-ink">Labels</span>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((l) => (
            <span key={l} className="inline-flex items-center gap-1 rounded-full bg-surface-inset px-2 py-0.5 text-hig-footnote text-ink">
              {l}
              <button
                type="button"
                aria-label={`Remove ${l}`}
                disabled={disabled}
                onClick={() => onChange(value.filter((x) => x !== l))}
                className="text-ink-tertiary hover:text-ink"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        aria-label="Add label"
        value={input}
        disabled={disabled}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
        placeholder="Add a label and press Enter"
        className="w-full rounded-md bg-surface border border-rule text-hig-body text-ink placeholder:text-ink-tertiary h-9 px-3 focus:outline-none focus:border-accent focus:shadow-focus"
      />
    </div>
  );
}
