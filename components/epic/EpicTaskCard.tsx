"use client";

import { useState } from "react";

type BakeState = "pending" | "baking" | "baked" | "failed";

type Props = {
  kind: "epic" | "task";
  title: string;
  descriptionPreview: string;
  taskType?: string;             // "story" / "task" / "bug" / "spike" / "epic" / "change_request"
  labels?: string[];
  blocksCount?: number;
  blockedByCount?: number;
  acCount?: number;
  uploadedIssueKey?: string;
  active: boolean;
  bakeState?: BakeState;
  bakeError?: string;
  onSelect: () => void;
  onDelete?: () => void;
};

const TYPE_LABEL: Record<string, string> = {
  story: "Story",
  task: "Task",
  bug: "Bug",
  spike: "Spike",
  epic: "Epic",
  change_request: "Change request",
};

function typeLabel(slug: string | undefined): string {
  return TYPE_LABEL[(slug ?? "").toLowerCase()] || slug || "Story";
}

function bakeChipLabel(s: BakeState): string {
  switch (s) {
    case "pending": return "pending";
    case "baking":  return "baking…";
    case "baked":   return "baked ✓";
    case "failed":  return "failed";
  }
}

function bakeChipClass(s: BakeState): string {
  switch (s) {
    case "pending": return "bg-slate-200 text-slate-700";
    case "baking":  return "bg-accent-tint text-accent";
    case "baked":   return "bg-success/10 text-success";
    case "failed":  return "bg-danger/10 text-danger";
  }
}

export function EpicTaskCard({
  kind, title, descriptionPreview, taskType, labels, blocksCount, blockedByCount,
  acCount, uploadedIssueKey, active, bakeState, bakeError, onSelect, onDelete,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const labelsList = labels ?? [];
  const blocks = blocksCount ?? 0;
  const blockedBy = blockedByCount ?? 0;
  const ac = acCount ?? 0;

  return (
    <div
      className={
        "group relative rounded-md border bg-surface px-4 py-3.5 transition-colors " +
        (active ? "border-accent ring-1 ring-accent/30" : "border-rule hover:border-rule-strong")
      }
    >
      <button
        type="button"
        onClick={onSelect}
        aria-label={`${title || "(untitled)"} — open ${kind === "epic" ? "epic" : "task"}`}
        className="block w-full text-left"
      >
        {/* Metadata top line: type · key */}
        <div className="text-hig-caption uppercase tracking-wide text-ink-tertiary font-semibold mb-1.5 flex items-center gap-2">
          <span>{kind === "epic" ? "Epic" : typeLabel(taskType)}</span>
          {uploadedIssueKey && (
            <>
              <span aria-hidden>·</span>
              <span className="text-success normal-case">{uploadedIssueKey}</span>
            </>
          )}
        </div>

        {/* Title */}
        <span className="block text-hig-headline font-semibold text-ink mb-1.5">{title || "(untitled)"}</span>

        {/* Description preview */}
        {descriptionPreview && (
          <p className="text-hig-footnote text-ink-secondary line-clamp-3 mb-2">{descriptionPreview}</p>
        )}

        {/* Metadata bottom block (tasks only) — plain text lines, no colored chips */}
        {kind === "task" && (
          <div className="flex flex-col gap-0.5 text-hig-caption text-ink-tertiary">
            {labelsList.length > 0 && (
              <p>
                <span className="font-medium text-ink-secondary">Labels:</span>{" "}
                {labelsList.slice(0, 8).join(", ")}
                {labelsList.length > 8 && ` +${labelsList.length - 8}`}
              </p>
            )}
            {(blocks > 0 || blockedBy > 0) && (
              <p>
                {blocks > 0 && <>Blocks {blocks}</>}
                {blocks > 0 && blockedBy > 0 && <> · </>}
                {blockedBy > 0 && <>Blocked by {blockedBy}</>}
              </p>
            )}
            {ac > 0 && (
              <p>{ac} acceptance {ac === 1 ? "criterion" : "criteria"}</p>
            )}
          </div>
        )}

        {/* Bake chip — separate row at the bottom so it stands apart */}
        {kind === "task" && bakeState && (
          <div className="mt-2">
            <span
              title={bakeError}
              className={"inline-flex items-center px-1.5 rounded-sm text-hig-caption font-medium " + bakeChipClass(bakeState)}
            >
              {bakeChipLabel(bakeState)}
            </span>
          </div>
        )}
      </button>

      {/* Hover-visible delete (tasks only) */}
      {kind === "task" && onDelete && !confirming && (
        <button
          type="button"
          aria-label="Delete task"
          onClick={() => setConfirming(true)}
          className="absolute top-1.5 right-1.5 w-6 h-6 inline-flex items-center justify-center rounded text-ink-tertiary hover:text-danger hover:bg-danger/10 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        >
          ×
        </button>
      )}
      {confirming && onDelete && (
        <div className="absolute inset-0 bg-surface rounded-md flex items-center justify-center gap-2 p-2">
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
