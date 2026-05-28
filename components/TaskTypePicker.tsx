"use client";

import { useEffect, useState } from "react";

type TemplateRecord = { key: string; label: string; modified: string | null };

type Props = {
  value: string;
  onValueChange: (next: string) => void;
  // When set, the select is disabled and only the matching option is shown.
  // Used by epic mode to pin the epic's own task type to "epic".
  lockedTo?: string;
};

// Pulls /api/templates/types on mount and renders a select dropdown. The
// endpoint kicks off a background re-sync internally so the list converges
// toward the remote source over time. The select is purely a key picker —
// the planner does the heavy lifting of reading the template file.
export function TaskTypePicker({ value, onValueChange, lockedTo }: Props) {
  const [types, setTypes] = useState<TemplateRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/templates/types", { credentials: "same-origin" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { templates?: TemplateRecord[] };
        if (cancelled) return;
        setTypes(Array.isArray(json.templates) ? json.templates : []);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "failed to load templates");
        setTypes([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // If the saved value isn't in the loaded list, append it as a fallback so
  // the user sees their selection rather than silently losing it.
  const list = (() => {
    if (!types) return [] as TemplateRecord[];
    if (value && !types.some((t) => t.key === value)) {
      return [...types, { key: value, label: value, modified: null }];
    }
    return types;
  })();

  // When locked, collapse the visible options to the locked entry (synthesizing
  // one if it hasn't loaded yet) and pin the rendered value.
  const finalList = lockedTo
    ? [list.find((t) => t.key === lockedTo) ?? { key: lockedTo, label: lockedTo, modified: null }]
    : list;
  const finalValue = lockedTo ?? value;

  return (
    <label className="flex flex-col gap-1.5">
      <span data-label className="text-hig-subhead font-medium text-ink">
        Task type
      </span>
      <span className="text-hig-footnote text-ink-secondary">
        Picks the template the planner follows on Finalize.
      </span>
      <select
        value={finalValue}
        onChange={(e) => {
          if (lockedTo) return;
          onValueChange(e.target.value);
        }}
        disabled={types === null || Boolean(lockedTo)}
        className={
          "h-10 px-3 rounded-md bg-surface border border-rule " +
          "text-hig-body text-ink " +
          "focus:outline-none focus:border-accent focus:shadow-focus " +
          "disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 ease-hig"
        }
        data-input
      >
        {types === null && !lockedTo && <option>Loading templates…</option>}
        {types !== null && finalList.length === 0 && <option value="">(no templates synced)</option>}
        {finalList.map((t) => (
          <option key={t.key} value={t.key}>
            {t.label}
          </option>
        ))}
      </select>
      {error && (
        <span className="text-hig-footnote text-danger">
          Couldn&apos;t load template list: {error}. Falling back to the saved selection.
        </span>
      )}
    </label>
  );
}
