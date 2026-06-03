"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { DraftCard } from "./DraftCard";
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
    return (
      <div data-testid="drafts-loading" className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="hig-card p-4 h-24 animate-pulse bg-surface-muted" />
        ))}
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="flex flex-col items-start gap-3">
        <div className="rounded-md bg-danger/5 border border-danger/30 px-4 py-2.5 w-full" role="alert">
          <p className="text-hig-footnote text-danger">{state.message}</p>
        </div>
        <Button type="button" variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }
  if (state.kind === "empty") {
    return (
      <div className="hig-card p-8 flex flex-col items-center gap-3 text-center">
        <h2 className="text-hig-title3">No drafts yet</h2>
        <p className="text-hig-footnote text-ink-secondary">
          Drafts you save will show up here so you can pick them back up anytime.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-1.5 rounded-md font-medium h-9 px-3.5 text-hig-subhead bg-accent text-white hover:bg-accent-hover"
        >
          Create a task
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {state.items.map((item) => (
        <DraftCard key={item.id} item={item} onDelete={onDelete} />
      ))}
    </div>
  );
}
