"use client";

import { useMemo } from "react";
import { diffLines } from "diff";

type Props = {
  before: string;
  after: string;
};

type Row = {
  left: string | null;
  right: string | null;
  state: "same" | "removed" | "added" | "modified-left" | "modified-right";
};

// Build a row-aligned representation: each emitted line lives on the left
// (removed/same) or right (added/same) so the two columns scroll together.
function alignRows(before: string, after: string): Row[] {
  const parts = diffLines(before, after, { ignoreWhitespace: false });
  const rows: Row[] = [];

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const next = parts[i + 1];
    const lines = trimTrailingNewline(p.value).split("\n");
    // Heuristic: a `removed` part immediately followed by an `added` part is a
    // "modified" block — pair them up row-by-row so the change reads as a
    // replacement, not a delete-then-insert.
    if (p.removed && next?.added) {
      const removed = lines;
      const added = trimTrailingNewline(next.value).split("\n");
      const max = Math.max(removed.length, added.length);
      for (let j = 0; j < max; j++) {
        rows.push({
          left: removed[j] ?? null,
          right: added[j] ?? null,
          state: removed[j] != null && added[j] != null
            ? "modified-right" // both exist, mark as changed
            : removed[j] != null ? "removed" : "added",
        });
      }
      i += 1; // skip the paired `added` part
      continue;
    }

    if (p.added) {
      for (const l of lines) rows.push({ left: null, right: l, state: "added" });
    } else if (p.removed) {
      for (const l of lines) rows.push({ left: l, right: null, state: "removed" });
    } else {
      for (const l of lines) rows.push({ left: l, right: l, state: "same" });
    }
  }

  return rows;
}

function trimTrailingNewline(s: string): string {
  return s.endsWith("\n") ? s.slice(0, -1) : s;
}

export function EditDiffView({ before, after }: Props) {
  const rows = useMemo(() => alignRows(before, after), [before, after]);

  if (rows.length === 0) {
    return (
      <div className="text-hig-footnote text-ink-tertiary italic px-3 py-2">
        (no content)
      </div>
    );
  }

  return (
    <div className="rounded-md border border-rule overflow-hidden">
      <div className="grid grid-cols-2 text-hig-caption font-medium uppercase tracking-wide bg-surface-muted border-b border-rule">
        <div className="px-3 py-1.5 border-r border-rule text-ink-secondary">Current</div>
        <div className="px-3 py-1.5 text-ink-secondary">Proposed</div>
      </div>
      <div className="grid grid-cols-2 font-mono text-hig-caption leading-[1.45]">
        <div className="border-r border-rule">
          {rows.map((r, i) => (
            <DiffCell key={`L${i}`} text={r.left} variant={leftVariant(r.state)} />
          ))}
        </div>
        <div>
          {rows.map((r, i) => (
            <DiffCell key={`R${i}`} text={r.right} variant={rightVariant(r.state)} />
          ))}
        </div>
      </div>
    </div>
  );
}

type CellVariant = "same" | "added" | "removed" | "modified" | "empty";

function leftVariant(state: Row["state"]): CellVariant {
  if (state === "same") return "same";
  if (state === "removed") return "removed";
  if (state === "modified-right") return "modified";
  return "empty";
}
function rightVariant(state: Row["state"]): CellVariant {
  if (state === "same") return "same";
  if (state === "added") return "added";
  if (state === "modified-right") return "modified";
  return "empty";
}

function DiffCell({ text, variant }: { text: string | null; variant: CellVariant }) {
  if (text == null) {
    return <div className="px-3 py-0.5 bg-surface-muted/30 min-h-[1.45em]">&nbsp;</div>;
  }
  const display = text === "" ? " " : text;
  let cls = "px-3 py-0.5 whitespace-pre-wrap break-words text-ink";
  if (variant === "added") cls += " bg-success/15";
  else if (variant === "removed") cls += " bg-danger/15";
  else if (variant === "modified") cls += " bg-warning/15";
  else if (variant === "empty") cls += " bg-surface-muted/30";
  return <div className={cls}>{display}</div>;
}
