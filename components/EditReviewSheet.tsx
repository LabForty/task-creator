"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { EditDiffView } from "@/components/EditDiffView";
import {
  applyEditToDraft,
  fieldAsText,
  fieldLabel,
  proposedAsText,
} from "@/lib/draft/applyEdit";
import type { Draft } from "@/lib/draft/autosave";
import type { ProposedEdit } from "@/lib/jobs/types";

type Props = {
  draft: Draft;
  edits: ProposedEdit[];
  onApply: (edit: ProposedEdit) => void;
  onApplyAll: () => void;
  onDiscard: (editId: string) => void;
  onClose: () => void;
};

// Right-side sheet with a stacked diff per pending edit. The "after" column
// for each edit is computed against the LIVE draft so applying edits in any
// order shows accurate previews.
export function EditReviewSheet({
  draft,
  edits,
  onApply,
  onApplyAll,
  onDiscard,
  onClose,
}: Props) {
  const items = useMemo(
    () =>
      edits.map((edit) => ({
        edit,
        before: fieldAsText(draft, edit),
        after: proposedAsText(edit, draft),
      })),
    [draft, edits],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Review proposed edits"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <section className="relative w-[min(880px,100vw)] h-full bg-surface border-l border-rule flex flex-col shadow-elevated overflow-hidden">
        <header className="px-5 py-4 border-b border-rule flex items-center gap-2 shrink-0">
          <div className="flex flex-col">
            <span className="hig-section-label">Review changes</span>
            <h2 className="text-hig-headline">
              {edits.length} pending {edits.length === 1 ? "edit" : "edits"}
            </h2>
          </div>
          <span className="flex-1" />
          <Button size="sm" onClick={onApplyAll} disabled={edits.length === 0}>
            Apply all
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </header>

        <div className="flex-1 min-h-0 overflow-auto px-5 py-4 flex flex-col gap-5">
          {items.length === 0 && (
            <p className="text-hig-footnote text-ink-secondary">No pending edits.</p>
          )}
          {items.map(({ edit, before, after }) => (
            <article key={edit.id} className="flex flex-col gap-2">
              <header className="flex items-center gap-2">
                <span className="text-hig-subhead font-semibold text-ink">
                  {fieldLabel(edit.field)}
                </span>
                <span className="text-hig-caption uppercase tracking-wide text-ink-tertiary">
                  {edit.op}
                </span>
                {edit.summary && (
                  <span className="text-hig-footnote text-ink-secondary truncate">
                    — {edit.summary}
                  </span>
                )}
                <span className="flex-1" />
                <Button size="sm" variant="secondary" onClick={() => onApply(edit)}>
                  Apply
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onDiscard(edit.id)}>
                  Discard
                </Button>
              </header>
              <EditDiffView before={before} after={after} />
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

// Convenience: apply a single edit to a Draft. Re-exported here so consumers
// don't have to pull in two modules.
export { applyEditToDraft };
