"use client";

import { useEffect, useRef, useState } from "react";
import { isValidFlagReason } from "@/lib/jira/metadata";

type Props = {
  initial?: string;
  readOnly?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
};

export function FlagReasonModal({
  initial = "",
  readOnly = false,
  onConfirm,
  onCancel,
}: Props) {
  const [val, setVal] = useState(initial);
  const dialogRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (
        e.key === "Enter" &&
        !e.shiftKey &&
        !readOnly &&
        isValidFlagReason(val)
      ) {
        e.preventDefault();
        onConfirm(val.trim());
      } else if (e.key === "Tab") {
        const root = dialogRef.current;
        if (!root) return;
        const focusables = root.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const list = Array.from(focusables).filter(
          (el) => !el.hasAttribute("disabled"),
        );
        if (list.length === 0) return;
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [val, onCancel, onConfirm, readOnly]);

  const valid = isValidFlagReason(val);
  const reasonId = "flag-reason-input";
  const helpId = "flag-reason-help";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Flag"
      ref={dialogRef}
      className="fixed inset-0 flex items-center justify-center bg-black/30 z-50"
    >
      <div className="bg-surface border border-rule rounded-md p-5 w-[min(28rem,92vw)] flex flex-col gap-3">
        <header>
          <h3 className="text-hig-title3">
            {readOnly ? "Flag reason" : "Set flag reason"}
          </h3>
        </header>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={reasonId} className="text-hig-subhead">
            Reason
          </label>
          {readOnly ? (
            <p
              id={reasonId}
              className="text-hig-body whitespace-pre-wrap break-words rounded-md bg-surface-muted px-3 py-2"
            >
              {initial}
            </p>
          ) : (
            <textarea
              id={reasonId}
              ref={textRef}
              value={val}
              onChange={(e) => setVal(e.target.value)}
              rows={4}
              aria-describedby={helpId}
              className="rounded-md border border-rule bg-surface px-3 py-2 text-hig-body focus:outline-none focus:border-accent focus:shadow-focus"
            />
          )}
          <span id={helpId} className="text-hig-footnote text-ink-secondary">
            3–500 characters.
          </span>
        </div>
        <footer className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-hig-subhead rounded-md hover:bg-surface-muted"
          >
            {readOnly ? "Close" : "Cancel"}
          </button>
          {!readOnly && (
            <button
              type="button"
              onClick={() => onConfirm(val.trim())}
              disabled={!valid}
              className="px-3 py-1.5 text-hig-subhead bg-accent text-on-accent rounded-md disabled:opacity-50"
            >
              Confirm
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
