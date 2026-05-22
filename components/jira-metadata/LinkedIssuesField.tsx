"use client";

import { useId, useState } from "react";
import { useIssueSearch, useLinkTypes } from "./hooks";
import type { JiraLinkedIssue } from "@/lib/jira/metadata";

type Props = {
  cloudId: string | null;
  projectKey: string | null;
  value: JiraLinkedIssue[];
  onChange: (next: JiraLinkedIssue[]) => void;
  disabled?: boolean;
};

export function LinkedIssuesField({
  cloudId,
  projectKey,
  value,
  onChange,
  disabled,
}: Props) {
  const [q, setQ] = useState("");
  const listboxId = useId();
  const issues = useIssueSearch(cloudId, projectKey, q);
  const types = useLinkTypes(cloudId);

  const defaultLinkId =
    types.data?.find((t) => /^relates$/i.test(t.name))?.id ??
    types.data?.[0]?.id ??
    "";

  function add(key: string, title: string) {
    if (!defaultLinkId) return;
    const exists = value.some(
      (v) => v.key === key && v.linkTypeId === defaultLinkId,
    );
    if (exists) return;
    onChange([...value, { key, title, linkTypeId: defaultLinkId }]);
    setQ("");
  }
  function remove(key: string, linkTypeId: string) {
    onChange(
      value.filter((v) => !(v.key === key && v.linkTypeId === linkTypeId)),
    );
  }
  function setLinkType(key: string, oldType: string, newType: string) {
    onChange(
      value.map((v) =>
        v.key === key && v.linkTypeId === oldType
          ? { ...v, linkTypeId: newType }
          : v,
      ),
    );
  }

  return (
    <div className="flex flex-col gap-1.5" data-field="linkedIssues">
      <label className="text-hig-subhead font-medium text-ink">
        Linked issues
      </label>
      <div className="flex flex-col gap-1">
        {value.map((v) => (
          <div
            key={`${v.key}::${v.linkTypeId}`}
            className="flex items-center gap-2 rounded-sm bg-surface-muted px-2 py-1"
          >
            <span className="font-mono text-hig-footnote">{v.key}</span>
            <select
              aria-label={`Link type for ${v.key}`}
              value={v.linkTypeId}
              onChange={(e) => setLinkType(v.key, v.linkTypeId, e.target.value)}
              disabled={disabled}
              className="text-hig-footnote bg-transparent border border-rule rounded-sm px-1"
            >
              {(types.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.outward}
                </option>
              ))}
            </select>
            <span className="flex-1 truncate text-hig-footnote text-ink-secondary">
              {v.title}
            </span>
            <button
              type="button"
              aria-label={`Remove ${v.key}`}
              onClick={() => remove(v.key, v.linkTypeId)}
              disabled={disabled}
              className="opacity-60 hover:opacity-100"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <input
        role="combobox"
        aria-label="Linked issue search"
        aria-expanded={q.trim().length >= 2}
        aria-controls={listboxId}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        disabled={disabled}
        placeholder="Type a key (ABC-123) or a title fragment…"
        className="h-10 px-3 rounded-md bg-surface border border-rule text-hig-body focus:outline-none focus:border-accent focus:shadow-focus"
      />
      {q.trim().length >= 2 && (
        <ul
          id={listboxId}
          role="listbox"
          className="rounded-md border border-rule bg-surface divide-y divide-rule"
        >
          {issues.loading && (
            <li className="px-3 py-1.5 text-hig-footnote text-ink-secondary">
              Searching…
            </li>
          )}
          {issues.error && (
            <li className="px-3 py-1.5 text-hig-footnote text-danger flex items-center gap-2">
              <span>Couldn&apos;t search issues.</span>
              <button
                type="button"
                onClick={issues.retry}
                className="underline"
              >
                Retry
              </button>
            </li>
          )}
          {!issues.loading &&
            !issues.error &&
            (issues.data ?? []).map((i) => (
              <li key={i.key}>
                <button
                  type="button"
                  onClick={() => add(i.key, i.title)}
                  className="w-full text-left px-3 py-1.5 text-hig-footnote hover:bg-surface-muted flex items-center gap-3"
                >
                  <span className="font-mono">{i.key}</span>
                  <span className="text-ink-secondary truncate">{i.title}</span>
                </button>
              </li>
            ))}
          {!issues.loading &&
            !issues.error &&
            (issues.data ?? []).length === 0 && (
              <li className="px-3 py-1.5 text-hig-footnote text-ink-secondary">
                No issues match.
              </li>
            )}
        </ul>
      )}
    </div>
  );
}
