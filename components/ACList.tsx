"use client";

import { useEffect, useRef } from "react";

type Props = {
  label: string;
  description?: string;
  value: string[];
  onItemsChange: (next: string[]) => void;
  placeholder?: string;
};

const fieldBase =
  "flex-1 min-w-0 rounded-md bg-surface border border-rule px-3 h-10 " +
  "text-hig-body text-ink placeholder:text-ink-tertiary " +
  "transition-all duration-150 ease-hig " +
  "focus:outline-none focus:border-accent focus:shadow-focus " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

// Editable acceptance-criteria list. Bullet on the left, input in the middle,
// × on the right. Pressing Enter on the last row appends a new empty row;
// pressing Enter on a non-last row jumps focus to the next row.
//
// Always renders at least one row so the user has somewhere to click.
export function ACList({ label, description, value, onItemsChange, placeholder }: Props) {
  const items = value.length === 0 ? [""] : value;
  const inputsRef = useRef<HTMLInputElement[]>([]);
  // Index to focus after the next render, or null.
  const focusOnRender = useRef<number | null>(null);

  useEffect(() => {
    if (focusOnRender.current == null) return;
    const idx = focusOnRender.current;
    focusOnRender.current = null;
    inputsRef.current[idx]?.focus();
  }, [items.length]);

  function commit(next: string[]) {
    onItemsChange(next);
  }

  function setAt(idx: number, text: string) {
    const next = items.slice();
    next[idx] = text;
    commit(next);
  }

  function removeAt(idx: number) {
    const next = items.slice();
    next.splice(idx, 1);
    commit(next.length === 0 ? [] : next);
    focusOnRender.current = Math.max(0, idx - 1);
  }

  function addAfter(idx: number) {
    const next = items.slice();
    next.splice(idx + 1, 0, "");
    commit(next);
    focusOnRender.current = idx + 1;
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>, idx: number) {
    if (e.key === "Enter") {
      e.preventDefault();
      addAfter(idx);
    } else if (e.key === "Backspace" && items[idx] === "" && items.length > 1) {
      e.preventDefault();
      removeAt(idx);
    }
  }

  return (
    <div className="flex flex-col gap-1.5 h-full" data-editor-field-inner>
      <span data-label className="text-hig-subhead font-medium text-ink">{label}</span>
      {description && (
        <span className="text-hig-footnote text-ink-secondary">{description}</span>
      )}
      <div className="flex flex-col gap-2 mt-0.5">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span
              aria-hidden
              className="text-ink-tertiary text-hig-body select-none shrink-0 w-3 text-center"
            >
              •
            </span>
            <input
              ref={(el) => {
                if (el) inputsRef.current[idx] = el;
              }}
              data-input={idx === 0 ? true : undefined}
              type="text"
              value={item}
              onChange={(e) => setAt(idx, e.target.value)}
              onKeyDown={(e) => onKey(e, idx)}
              placeholder={idx === 0 ? placeholder : undefined}
              className={fieldBase}
              aria-label={`Acceptance criterion ${idx + 1}`}
            />
            <button
              type="button"
              onClick={() => removeAt(idx)}
              disabled={items.length === 1 && item === ""}
              className={
                "shrink-0 h-8 w-8 rounded-md text-ink-secondary " +
                "hover:bg-surface-muted hover:text-danger " +
                "focus:outline-none focus:ring-2 focus:ring-accent " +
                "disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              }
              aria-label={`Remove criterion ${idx + 1}`}
              title="Remove"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => addAfter(items.length - 1)}
          className={
            "self-start mt-1 inline-flex items-center gap-1.5 px-2.5 h-8 " +
            "text-hig-footnote font-medium text-accent " +
            "rounded-md hover:bg-accent-tint focus:outline-none focus:ring-2 focus:ring-accent " +
            "transition-colors"
          }
        >
          <span aria-hidden>+</span>
          <span>Add criterion</span>
        </button>
      </div>
    </div>
  );
}
