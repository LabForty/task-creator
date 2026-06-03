"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { formatRelativeTime } from "@/lib/drafts/time";
import type { DraftListItem } from "@/lib/drafts/payload";

type Props = {
  item: DraftListItem;
  now?: number;
  onDelete: (id: string) => void;
};

export function DraftCard({ item, now, onDelete }: Props) {
  // Capture a stable "now" once (lazy init) when the caller doesn't supply one,
  // so render stays pure — Date.now() in the render body is a lint error here.
  const [fallbackNow] = useState(() => Date.now());
  const effectiveNow = now ?? fallbackNow;
  return (
    <div className="hig-card p-4 flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <h3 className="text-hig-headline flex-1 min-w-0 truncate">{item.workingTitle}</h3>
        <span className="text-hig-footnote text-ink-secondary shrink-0">
          {formatRelativeTime(item.updatedAt, effectiveNow)}
        </span>
      </div>
      <span
        className={
          "self-start rounded-full px-2 py-0.5 text-hig-caption font-medium " +
          (item.mode === "epic"
            ? "bg-accent-tint text-accent"
            : "bg-surface-muted text-ink-secondary")
        }
      >
        {item.mode === "epic" ? "Epic" : "Single"}
      </span>
      {item.preview && (
        <p className="text-hig-footnote text-ink-secondary line-clamp-2">{item.preview}</p>
      )}
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button type="button" variant="danger" size="sm" onClick={() => onDelete(item.id)}>
          Delete
        </Button>
        <a
          href={`/?draft=${item.id}`}
          className="inline-flex items-center justify-center gap-1.5 rounded-md font-medium h-7 px-2.5 text-hig-footnote bg-accent text-white hover:bg-accent-hover"
        >
          Open
        </a>
      </div>
    </div>
  );
}
