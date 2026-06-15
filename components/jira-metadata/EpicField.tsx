"use client";

import { useState } from "react";
import { useEpics } from "./hooks";
import type { JiraEpicRef } from "@/lib/jira/metadata";

type Props = {
  cloudId: string | null;
  projectKey: string | null;
  value: JiraEpicRef | undefined;
  onChange: (next: JiraEpicRef | undefined) => void;
  disabled?: boolean;
};

export function EpicField({ cloudId, projectKey, value, onChange, disabled }: Props) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const epics = useEpics(cloudId, projectKey);

  return (
    <div className="flex flex-col gap-1.5" data-field="epic">
      <label className="text-hig-subhead font-medium text-ink">Epic</label>
      {value?.kind === "existing" && (
        <div className="flex items-center gap-2 rounded-sm bg-surface-muted px-2 py-1 text-hig-footnote">
          <span>{`${value.key} — ${value.title}`}</span>
          <button type="button" aria-label="Clear epic" onClick={() => onChange(undefined)} className="ml-auto opacity-60 hover:opacity-100">×</button>
        </div>
      )}
      {value?.kind === "new" && (
        <div className="flex items-center gap-2 rounded-sm bg-accent-tint px-2 py-1 text-hig-footnote">
          <span>{`New: ${value.title}`}</span>
          <button type="button" aria-label="Clear new epic" onClick={() => onChange(undefined)} className="ml-auto opacity-60 hover:opacity-100">×</button>
        </div>
      )}
      {!value && (
        <>
          {epics.loading && <span className="text-hig-footnote text-ink-secondary">Loading epics…</span>}
          {epics.error && (
            <span className="text-hig-footnote text-danger-strong flex items-center gap-2">
              Couldn&apos;t load epics.
              <button type="button" onClick={epics.retry} className="underline">Retry</button>
            </span>
          )}
          {!epics.loading && !epics.error && (
            <ul className="rounded-md border border-rule bg-surface divide-y divide-rule max-h-48 overflow-auto">
              {(epics.data ?? []).map((e) => (
                <li key={e.key}>
                  <button
                    type="button"
                    onClick={() => onChange({ kind: "existing", key: e.key, title: e.title })}
                    className="w-full text-left px-3 py-1.5 text-hig-footnote hover:bg-surface-muted flex items-center gap-3"
                  >
                    <span className="font-mono">{e.key}</span>
                    <span className="truncate">{e.title}</span>
                  </button>
                </li>
              ))}
              {(epics.data ?? []).length === 0 && (
                <li className="px-3 py-1.5 text-hig-footnote text-ink-secondary">No open epics in this project — create one below.</li>
              )}
            </ul>
          )}
          {!creating && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              disabled={disabled || !projectKey}
              className="self-start text-hig-footnote underline"
            >Create new epic</button>
          )}
          {creating && (
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="new-epic-title">New epic title</label>
              <input
                id="new-epic-title"
                aria-label="New epic title"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="New epic title…"
                className="flex-1 h-10 px-3 rounded-md bg-surface border border-rule text-hig-body focus:outline-none focus:border-accent focus:shadow-focus"
              />
              <button
                type="button"
                onClick={() => { if (draft.trim()) onChange({ kind: "new", title: draft.trim() }); setCreating(false); setDraft(""); }}
                disabled={!draft.trim()}
                className="px-3 py-1.5 text-hig-subhead bg-accent text-on-accent rounded-md disabled:opacity-50"
              >Create</button>
              <button type="button" onClick={() => { setCreating(false); setDraft(""); }} className="px-3 py-1.5 text-hig-subhead rounded-md hover:bg-surface-muted">Cancel</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
