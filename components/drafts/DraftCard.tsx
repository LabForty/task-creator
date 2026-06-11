"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ConfirmPopover } from "@/components/ui/ConfirmPopover";
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
  const [confirming, setConfirming] = useState(false);
  const deleteAnchorRef = useRef<HTMLDivElement>(null);
  const effectiveNow = now ?? fallbackNow;
  const epic = item.mode === "epic";

  return (
    <div
      className={
        "group relative hig-card border p-4 pl-6 flex flex-col gap-2 " +
        "transition-all duration-150 ease-hig " +
        // While the delete confirm is open, NOTHING may depend on :hover.
        // The hover lift moves the card's own hit area, so a pointer resting
        // near the bottom edge flips hover on/off forever and the card (with
        // the popover anchored inside it) bobs in a loop — the "blinking
        // delete modal". Pin the lifted look steady instead.
        (confirming
          ? "-translate-y-0.5 shadow-elevated border-accent/25 motion-reduce:translate-y-0"
          : // Suppress the hover lift transform under prefers-reduced-motion so
            // the hover becomes a plain state change (shadow/border still apply);
            // the global reduced-motion rule already zeroes the transition duration.
            "border-transparent hover:-translate-y-0.5 hover:shadow-elevated hover:border-accent/25 motion-reduce:hover:translate-y-0")
      }
    >
      {/* Mode accent pill — inset so it never fights the card's rounded corners. */}
      <span
        aria-hidden
        className={
          "absolute left-2 top-3 bottom-3 w-[3px] rounded-full " +
          (epic ? "bg-accent" : "bg-ink-quaternary")
        }
      />
      <div className="flex items-center gap-3 min-w-0">
        <h3 className="text-hig-headline min-w-0 truncate">
          {/* Stretched link: makes the whole card the click target while the
              action buttons below sit above it on their own z layer. */}
          <Link href={`/?draft=${item.id}`} className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:shadow-focus">
            {item.workingTitle}
          </Link>
        </h3>
        <span
          className={
            "shrink-0 rounded-full px-2 py-0.5 text-hig-caption font-medium " +
            (epic ? "bg-accent-tint text-accent" : "bg-surface-muted text-ink-secondary")
          }
        >
          {/* For epics the list preview IS the task count ("3 tasks") — fold it
              into the chip instead of repeating it as a paragraph below. */}
          {epic ? `Epic · ${item.preview}` : "Single"}
        </span>
        <span className="ml-auto text-hig-footnote text-ink-tertiary shrink-0">
          {formatRelativeTime(item.updatedAt, effectiveNow)}
        </span>
      </div>
      {!epic && item.preview && (
        <p className="text-hig-footnote text-ink-secondary line-clamp-2">{item.preview}</p>
      )}
      <div
        className={
          // Hidden until hover on pointer devices; always visible on touch
          // (no hover), while focused, and while the confirm popover is open
          // so its visibility never flickers with pointer position.
          "relative z-10 flex items-center justify-end gap-2 pt-1 " +
          "transition-opacity duration-150 ease-hig " +
          (confirming
            ? "opacity-100"
            : "[@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100")
        }
      >
        <div className="relative" ref={deleteAnchorRef}>
          <Button type="button" variant="danger" size="sm" onClick={() => setConfirming((v) => !v)}>
            Delete
          </Button>
          <ConfirmPopover
            open={confirming}
            message="Delete this draft? This can't be undone."
            confirmLabel="Delete"
            anchorRef={deleteAnchorRef}
            onConfirm={() => {
              setConfirming(false);
              onDelete(item.id);
            }}
            onCancel={() => setConfirming(false)}
          />
        </div>
        <Link
          href={`/?draft=${item.id}`}
          className="inline-flex items-center justify-center gap-1.5 rounded-md font-medium h-7 px-2.5 text-hig-footnote bg-accent text-white hover:bg-accent-hover transition-colors"
        >
          Open
        </Link>
      </div>
    </div>
  );
}
