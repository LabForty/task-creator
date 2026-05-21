"use client";

import { useEffect, useState } from "react";

type TemplateRecord = { key: string; label: string; modified: string | null };

type Props = {
  value: string;
  onValueChange: (next: string) => void;
};

// Pulls /api/templates/types on mount and renders a select dropdown. The
// endpoint kicks off a background re-sync internally so the list converges
// toward the remote source over time. The select is purely a key picker —
// the planner does the heavy lifting of reading the template file.
export function TaskTypePicker({ value, onValueChange }: Props) {
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

  return (
    <label className="flex flex-col gap-1.5">
      <span data-label className="text-hig-subhead font-medium text-ink">
        Task type
      </span>
      <span className="text-hig-footnote text-ink-secondary">
        Picks the template the planner follows on Finalize.
      </span>
      <select
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        disabled={types === null}
        className={
          "h-10 px-3 rounded-md bg-surface border border-rule " +
          "text-hig-body text-ink " +
          "focus:outline-none focus:border-accent focus:shadow-focus " +
          "disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 ease-hig"
        }
        data-input
      >
        {types === null && <option>Loading templates…</option>}
        {types !== null && list.length === 0 && <option value="">(no templates synced)</option>}
        {list.map((t) => (
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
