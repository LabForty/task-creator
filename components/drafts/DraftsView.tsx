"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { DraftCard } from "./DraftCard";
import { fadeUp } from "@/lib/motion";
import type { DraftListItem } from "@/lib/drafts/payload";

export type DraftsState =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; items: DraftListItem[] };

type Props = {
  state: DraftsState;
  onDelete: (id: string) => void;
  onRetry: () => void;
};

export function DraftsView({ state, onDelete, onRetry }: Props) {
  if (state.kind === "loading") {
    // Skeletons match the real card silhouette (title row + chip + preview)
    // so the loaded list doesn't jump.
    return (
      <div data-testid="drafts-loading" className="flex flex-col gap-3" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="hig-card p-4 pl-6 flex flex-col gap-2.5 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="h-4 w-44 rounded bg-surface-inset" />
              <div className="h-4 w-14 rounded-full bg-surface-inset" />
              <div className="ml-auto h-3 w-12 rounded bg-surface-inset" />
            </div>
            <div className="h-3 w-3/4 rounded bg-surface-inset" />
          </div>
        ))}
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <motion.div variants={fadeUp} initial="hidden" animate="visible" className="flex flex-col items-start gap-3">
        <div className="rounded-md bg-danger/5 border border-danger/30 px-4 py-2.5 w-full" role="alert">
          <p className="text-hig-footnote text-danger">{state.message}</p>
        </div>
        <Button type="button" variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      </motion.div>
    );
  }
  if (state.kind === "empty") {
    return (
      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        className="hig-card p-8 flex flex-col items-center gap-3 text-center"
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-tint" aria-hidden>
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
            <path d="M9 13h6M9 17h4" />
          </svg>
        </span>
        <h2 className="text-hig-title3">No drafts yet</h2>
        <p className="text-hig-footnote text-ink-secondary">
          Drafts you save will show up here so you can pick them back up anytime.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-1.5 rounded-md font-medium h-9 px-3.5 text-hig-subhead bg-accent text-white hover:bg-accent-hover transition-colors"
        >
          Create a task
        </Link>
      </motion.div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {/* popLayout pops exiting cards out of the layout flow so the
          remaining cards reflow smoothly (layout) while the deleted one
          shrinks and fades in place. */}
      <AnimatePresence mode="popLayout">
        {state.items.map((item, i) => (
          <motion.div
            key={item.id}
            layout
            custom={i}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <DraftCard item={item} onDelete={onDelete} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
