"use client";

import { useState } from "react";

type BakeState = "pending" | "baking" | "baked" | "failed";

type Props = {
  kind: "epic" | "task";
  title: string;
  descriptionPreview: string;
  labelsCount?: number;
  linksCount?: number;
  active: boolean;
  bakeState?: BakeState;
  bakeError?: string;
  onSelect: () => void;
  onDelete?: () => void;          // omitted/ignored for kind="epic"
};

function bakeChipLabel(s: BakeState): string {
  switch (s) {
    case "pending": return "pending";
    case "baking": return "baking…";
    case "baked": return "baked ✓";
    case "failed": return "failed";
  }
}

function bakeChipClass(s: BakeState): string {
  switch (s) {
    case "pending": return "bg-slate-200 text-slate-700";
    case "baking": return "bg-accent-tint text-accent";
    case "baked": return "bg-success/10 text-success";
    case "failed": return "bg-danger/10 text-danger";
  }
}

export function EpicTaskCard({
  kind, title, descriptionPreview, labelsCount, linksCount, active,
  bakeState, bakeError, onSelect, onDelete,
}: Props) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div
      className={
        "group relative rounded-md border bg-surface px-3 py-2.5 transition-colors " +
        (active ? "border-accent ring-1 ring-accent/30" : "border-rule hover:border-rule-strong")
      }
    >
      <button
        type="button"
        onClick={onSelect}
        aria-label={`${title || "(untitled)"} — open ${kind === "epic" ? "epic" : "task"}`}
        className="block w-full text-left"
      >
        <div className="flex items-baseline gap-2 mb-0.5">
          {kind === "epic" && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-tertiary shrink-0">Epic</span>
          )}
          <span className="text-hig-subhead font-medium text-ink truncate flex-1">{title || "(untitled)"}</span>
        </div>
        {descriptionPreview && (
          <p className="text-hig-footnote text-ink-secondary line-clamp-2">{descriptionPreview}</p>
        )}
        {kind === "task" && ((labelsCount ?? 0) > 0 || (linksCount ?? 0) > 0 || bakeState) && (
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {(labelsCount ?? 0) > 0 && (
              <span className="text-[10px] text-ink-tertiary">{labelsCount} label{labelsCount === 1 ? "" : "s"}</span>
            )}
            {(linksCount ?? 0) > 0 && (
              <span className="text-[10px] text-ink-tertiary">{linksCount} link{linksCount === 1 ? "" : "s"}</span>
            )}
            {bakeState && (
              <span
                title={bakeError}
                className={"inline-flex items-center px-1.5 rounded-sm text-[10px] font-medium " + bakeChipClass(bakeState)}
              >
                {bakeChipLabel(bakeState)}
              </span>
            )}
          </div>
        )}
      </button>

      {kind === "task" && onDelete && !confirming && (
        <button
          type="button"
          aria-label="Delete task"
          onClick={() => setConfirming(true)}
          className="absolute top-1 right-1 w-6 h-6 inline-flex items-center justify-center rounded text-ink-tertiary hover:text-danger hover:bg-danger/10 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        >
          ×
        </button>
      )}
      {confirming && onDelete && (
        <div className="absolute inset-0 bg-surface/95 rounded-md flex items-center justify-center gap-2 p-2">
          <span className="text-hig-footnote text-ink">Delete?</span>
          <button
            type="button"
            onClick={() => { setConfirming(false); onDelete(); }}
            className="px-2 py-0.5 rounded-sm text-hig-footnote bg-danger text-white hover:bg-danger/90"
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="px-2 py-0.5 rounded-sm text-hig-footnote bg-surface-muted text-ink hover:bg-surface-strong"
          >
            No
          </button>
        </div>
      )}
    </div>
  );
}
