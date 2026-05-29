"use client";

import { useState } from "react";

type BakeState = "pending" | "baking" | "baked" | "failed";

type Props = {
  kind: "epic" | "task";
  title: string;
  descriptionPreview: string;
  taskType?: string;             // e.g. "story" / "task" / "bug" / "spike" / "epic" / "change_request"
  labels?: string[];             // full label list (was a count)
  blocksCount?: number;
  blockedByCount?: number;
  uploadedIssueKey?: string;
  active: boolean;
  bakeState?: BakeState;
  bakeError?: string;
  onSelect: () => void;
  onDelete?: () => void;
};

// Map task-type slugs to a label + tailwind palette. Mirrors Jira's color
// conventions: Story=green, Task=blue, Bug=red, Epic=purple, Spike=orange,
// Change request=amber. Unknown/missing types fall through to a neutral slate.
function typeChip(slug: string | undefined): { label: string; cls: string } {
  switch ((slug || "").toLowerCase()) {
    case "story":          return { label: "Story",       cls: "bg-green-100 text-green-800 border-green-200" };
    case "task":           return { label: "Task",        cls: "bg-blue-100 text-blue-800 border-blue-200" };
    case "bug":            return { label: "Bug",         cls: "bg-red-100 text-red-800 border-red-200" };
    case "spike":          return { label: "Spike",       cls: "bg-orange-100 text-orange-800 border-orange-200" };
    case "epic":           return { label: "Epic",        cls: "bg-purple-100 text-purple-800 border-purple-200" };
    case "change_request": return { label: "Change req.", cls: "bg-amber-100 text-amber-800 border-amber-200" };
    default:               return { label: slug || "Story", cls: "bg-slate-200 text-slate-700 border-slate-300" };
  }
}

// Stable label-color picker. Hashes the label string into one of N palette
// entries so the same label always gets the same color across cards.
const LABEL_PALETTES = [
  "bg-sky-100 text-sky-800 border-sky-200",
  "bg-emerald-100 text-emerald-800 border-emerald-200",
  "bg-rose-100 text-rose-800 border-rose-200",
  "bg-violet-100 text-violet-800 border-violet-200",
  "bg-amber-100 text-amber-800 border-amber-200",
  "bg-teal-100 text-teal-800 border-teal-200",
  "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200",
];

function labelClass(label: string): string {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) & 0x7fffffff;
  return LABEL_PALETTES[h % LABEL_PALETTES.length];
}

function bakeChipLabel(s: BakeState): string {
  switch (s) {
    case "pending":  return "pending";
    case "baking":   return "baking…";
    case "baked":    return "baked ✓";
    case "failed":   return "failed";
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
  uploadedIssueKey, active, bakeState, bakeError, onSelect, onDelete,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const type = typeChip(taskType);
  const labelsList = labels ?? [];
  const blocks = blocksCount ?? 0;
  const blockedBy = blockedByCount ?? 0;

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
        {/* Top row: type chip + (right) uploaded key */}
        <div className="flex items-center gap-2 mb-2">
          <span
            className={
              "inline-flex items-center px-1.5 py-[1px] rounded-sm text-[10px] font-semibold uppercase tracking-wide border " +
              (kind === "epic"
                ? "bg-purple-100 text-purple-800 border-purple-200"
                : type.cls)
            }
          >
            {kind === "epic" ? "Epic" : type.label}
          </span>
          <span className="flex-1" />
          {uploadedIssueKey && (
            <span className="inline-flex items-center px-1.5 rounded-sm text-[10px] font-semibold uppercase tracking-wide bg-success/10 text-success">
              {uploadedIssueKey}
            </span>
          )}
        </div>

        {/* Title */}
        <span className="block text-hig-headline font-semibold text-ink mb-1.5">{title || "(untitled)"}</span>

        {/* Description preview */}
        {descriptionPreview && (
          <p className="text-hig-footnote text-ink-secondary line-clamp-3 mb-2">{descriptionPreview}</p>
        )}

        {/* Labels — only for tasks (epic skips) */}
        {kind === "task" && labelsList.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap mb-1.5">
            {labelsList.slice(0, 6).map((label) => (
              <span
                key={label}
                className={
                  "inline-flex items-center px-1.5 py-[1px] rounded-sm text-[10px] font-medium border " +
                  labelClass(label)
                }
              >
                {label}
              </span>
            ))}
            {labelsList.length > 6 && (
              <span className="text-[10px] text-ink-tertiary">+{labelsList.length - 6}</span>
            )}
          </div>
        )}

        {/* Dependencies + bake-state row */}
        {kind === "task" && (blocks > 0 || blockedBy > 0 || bakeState) && (
          <div className="flex items-center gap-2 flex-wrap text-[10px] text-ink-tertiary">
            {blocks > 0 && (
              <span title={`${blocks} blocks`}>↓ {blocks}</span>
            )}
            {blockedBy > 0 && (
              <span title={`${blockedBy} blocked by`}>↑ {blockedBy}</span>
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
