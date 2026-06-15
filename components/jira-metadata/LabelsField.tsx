"use client";

import { useId, useMemo, useState } from "react";
import { useJiraLabels } from "./hooks";
import { dedupeLabels, normalizeLabel } from "@/lib/jira/metadata";

type Props = {
  cloudId: string | null;
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
};

export function LabelsField({ cloudId, value, onChange, disabled }: Props) {
  const [input, setInput] = useState("");
  const listboxId = useId();
  const { data, loading, error, retry } = useJiraLabels(cloudId, input);

  const suggestions = useMemo(() => {
    const valNorm = new Set(value.map(normalizeLabel));
    return (data ?? []).filter((s) => !valNorm.has(normalizeLabel(s)));
  }, [data, value]);

  const trimmed = input.trim();
  const exactMatch = (data ?? []).some(
    (s) => normalizeLabel(s) === normalizeLabel(trimmed),
  );
  const alreadySelected = value.some(
    (s) => normalizeLabel(s) === normalizeLabel(trimmed),
  );
  const showCreate = trimmed.length > 0 && !exactMatch && !alreadySelected;

  function add(label: string) {
    onChange(dedupeLabels([...value, label]));
    setInput("");
  }
  function remove(label: string) {
    onChange(value.filter((l) => normalizeLabel(l) !== normalizeLabel(label)));
  }

  return (
    <div className="flex flex-col gap-1.5" data-field="labels">
      <label className="text-hig-subhead font-medium text-ink">Labels</label>
      <div className="flex flex-wrap gap-1.5 items-center rounded-md border border-rule bg-surface px-2 py-1.5 min-h-10 focus-within:border-accent focus-within:shadow-focus">
        {value.map((l) => (
          <span
            key={l}
            className="inline-flex items-center gap-1 rounded-sm bg-surface-muted px-2 py-0.5 text-hig-footnote"
          >
            {l}
            <button
              type="button"
              aria-label={`Remove ${l}`}
              onClick={() => remove(l)}
              disabled={disabled}
              className="opacity-60 hover:opacity-100"
            >
              ×
            </button>
          </span>
        ))}
        <input
          role="combobox"
          aria-expanded={trimmed.length > 0}
          aria-controls={listboxId}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !input && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          disabled={disabled}
          className="flex-1 min-w-[8ch] bg-transparent outline-none text-hig-body"
          placeholder={value.length ? "" : "Add labels…"}
        />
      </div>
      {trimmed.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="rounded-md border border-rule bg-surface divide-y divide-rule"
        >
          {loading && (
            <li className="px-3 py-1.5 text-hig-footnote text-ink-secondary">
              Loading…
            </li>
          )}
          {error && (
            <li className="px-3 py-1.5 text-hig-footnote text-danger-strong flex items-center gap-2">
              <span>Couldn&apos;t load labels.</span>
              <button type="button" onClick={retry} className="underline">
                Retry
              </button>
            </li>
          )}
          {!loading &&
            !error &&
            suggestions.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => add(s)}
                  className="w-full text-left px-3 py-1.5 text-hig-footnote hover:bg-surface-muted"
                >
                  {s}
                </button>
              </li>
            ))}
          {!loading && !error && suggestions.length === 0 && !showCreate && (
            <li className="px-3 py-1.5 text-hig-footnote text-ink-secondary">
              No matching labels.
            </li>
          )}
          {!loading && !error && showCreate && (
            <li>
              <button
                type="button"
                onClick={() => add(trimmed)}
                className="w-full text-left px-3 py-1.5 text-hig-footnote hover:bg-surface-muted"
              >
                Create &quot;{trimmed}&quot;
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
