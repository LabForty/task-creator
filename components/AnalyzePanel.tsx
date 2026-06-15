"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { AnalyzeFinding } from "@/lib/jobs/types";

type Props = {
  findings: AnalyzeFinding[];
  onApply: (acceptedIds: string[]) => void;
  onDismiss: () => void;
  applying?: boolean;
};

const SEVERITY_LABEL: Record<AnalyzeFinding["severity"], string> = {
  info: "Info",
  warn: "Warning",
  error: "Inconsistency",
};

const SEVERITY_CHIP: Record<AnalyzeFinding["severity"], string> = {
  info: "bg-accent-tint text-accent",
  warn: "bg-warning/10 text-warning",
  error: "bg-danger/10 text-danger",
};

export function AnalyzePanel({ findings, onApply, onDismiss, applying = false }: Props) {
  const [accepted, setAccepted] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="hig-glass-strong p-6 flex flex-col gap-4" aria-label="Diagram analysis">
      <header className="flex items-start flex-wrap gap-3">
        <div className="flex flex-col">
          <span className="hig-section-label">Analysis</span>
          <h2 className="text-hig-title3">
            {findings.length === 0
              ? "No inconsistencies found"
              : `${findings.length} ${findings.length === 1 ? "finding" : "findings"}`}
          </h2>
          {findings.length > 0 && (
            <p className="text-hig-footnote text-ink-secondary mt-1">
              {accepted.size} accepted · review each, then apply.
            </p>
          )}
        </div>
        <span className="flex-1" />
        <Button variant="ghost" onClick={onDismiss} disabled={applying}>
          Close
        </Button>
        {findings.length > 0 && (
          <Button onClick={() => onApply([...accepted])} disabled={applying || accepted.size === 0}>
            {applying ? "Applying…" : `Apply ${accepted.size}`}
          </Button>
        )}
      </header>

      {findings.length === 0 ? (
        <p className="mx-auto max-w-sm rounded-xl bg-surface-muted px-5 py-6 text-center text-hig-footnote text-ink-secondary">
          Compared the task text against the diagrams and didn&apos;t spot any
          mismatches worth surfacing.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {findings.map((f) => {
            const isAccepted = accepted.has(f.id);
            return (
              <li
                key={f.id}
                className={
                  "rounded-md border bg-surface p-4 flex flex-col gap-2 transition " +
                  (isAccepted ? "border-accent shadow-card" : "border-rule")
                }
              >
                <header className="flex items-center gap-2">
                  <span
                    className={
                      "inline-flex items-center text-hig-caption font-semibold uppercase tracking-wide " +
                      "px-2 py-0.5 rounded-sm " +
                      SEVERITY_CHIP[f.severity]
                    }
                  >
                    {SEVERITY_LABEL[f.severity]}
                  </span>
                  <span className="flex-1" />
                  <label className="flex items-center gap-1.5 text-hig-footnote text-ink cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isAccepted}
                      onChange={() => toggle(f.id)}
                      disabled={applying}
                      className="h-4 w-4 accent-accent"
                    />
                    Accept
                  </label>
                </header>
                <p className="text-hig-subhead text-ink">{f.summary}</p>
                {f.proposedSync && (
                  <details className="text-hig-footnote">
                    <summary className="cursor-pointer text-ink-secondary hover:text-ink">
                      Show proposed changes
                    </summary>
                    <pre className="mt-2 p-3 rounded-md bg-surface-muted font-mono leading-relaxed whitespace-pre-wrap text-ink">
                      {JSON.stringify(f.proposedSync, null, 2)}
                    </pre>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
