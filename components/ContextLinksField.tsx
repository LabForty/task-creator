"use client";

import { ClipboardEvent, KeyboardEvent, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
};

const URL_RE = /https?:\/\/[^\s<>"']+/gi;

function stripTrailingPunctuation(url: string): string {
  return url.replace(/[),.;]+$/g, "");
}

function normalizeUrl(input: string): string | null {
  const trimmed = stripTrailingPunctuation(input.trim());
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function extractUrls(input: string): string[] {
  const matches = input.match(URL_RE);
  const raw = matches?.length ? matches : input.split(/[\s,]+/);
  const urls: string[] = [];
  for (const part of raw) {
    const normalized = normalizeUrl(part);
    if (normalized) urls.push(normalized);
  }
  return urls;
}

export function ContextLinksField({ value, onChange }: Props) {
  const [pending, setPending] = useState("");
  const [error, setError] = useState<string | null>(null);

  const deduped = useMemo(() => {
    const seen = new Set<string>();
    return value.filter((url) => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    });
  }, [value]);

  function addFromText(text: string): boolean {
    const urls = extractUrls(text);
    if (urls.length === 0) {
      setError("Enter a valid http or https URL.");
      return false;
    }
    const seen = new Set(deduped);
    const next = [...deduped];
    for (const url of urls) {
      if (seen.has(url)) continue;
      seen.add(url);
      next.push(url);
    }
    onChange(next);
    setPending("");
    setError(null);
    return true;
  }

  function remove(url: string) {
    onChange(deduped.filter((item) => item !== url));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (pending.trim()) addFromText(pending);
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text");
    const urls = extractUrls(pasted);
    if (urls.length === 0) return;
    e.preventDefault();
    addFromText(pasted);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="context-links-input" className="text-hig-subhead font-medium text-ink">
        Attach to context
      </label>
      <span className="text-hig-footnote text-ink-secondary">
        Jira, Confluence, GitHub, Figma, or docs links used as source context.
      </span>
      <div className="flex gap-2">
        <input
          id="context-links-input"
          data-input
          type="text"
          inputMode="url"
          value={pending}
          onChange={(e) => {
            setPending(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder="https://..."
          className="h-10 min-w-0 flex-1 rounded-md border border-rule bg-surface px-3 text-hig-body text-ink placeholder:text-ink-tertiary transition-all duration-150 ease-hig focus:border-accent focus:outline-none focus:shadow-focus"
        />
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            if (pending.trim()) addFromText(pending);
          }}
        >
          Add
        </Button>
      </div>
      {error && <span className="text-hig-footnote text-danger-strong">{error}</span>}
      {deduped.length > 0 && (
        <ul className="flex flex-col gap-1.5" aria-label="Attached context links">
          {deduped.map((url) => (
            <li
              key={url}
              className="flex min-h-9 items-center justify-between gap-3 rounded-md border border-rule bg-surface-muted px-2.5 py-1.5"
            >
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-hig-footnote text-accent-link hover:underline"
                title={url}
              >
                {url}
              </a>
              <button
                type="button"
                onClick={() => remove(url)}
                className="text-hig-caption font-medium text-ink-secondary transition-colors hover:text-danger-strong focus-visible:outline-none focus-visible:shadow-focus"
                aria-label={`Remove ${url}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
