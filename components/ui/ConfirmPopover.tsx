"use client";

import { useEffect, useId, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { scaleIn } from "@/lib/motion";
import { Button } from "@/components/ui/Button";

type Props = {
  open: boolean;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  // The element that opened the popover. Mousedown inside it is NOT an
  // outside-click — without this, pressing the anchor again cancels on
  // mousedown and reopens on click, blinking the popover instead of toggling.
  anchorRef?: React.RefObject<HTMLElement | null>;
};

// Small anchored confirm dialog replacing window.confirm. Render it inside a
// relatively-positioned parent (it pops up below the anchor's right edge).
// Escape and outside-click both cancel, matching native dialog expectations.
export function ConfirmPopover({ open, message, confirmLabel, onConfirm, onCancel, anchorRef }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const messageId = useId();

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (anchorRef?.current?.contains(target)) return;
      if (ref.current && !ref.current.contains(target)) onCancel();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, onCancel, anchorRef]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          role="alertdialog"
          aria-describedby={messageId}
          variants={scaleIn}
          initial="hidden"
          animate="visible"
          exit="exit"
          style={{ transformOrigin: "top right" }}
          className="absolute right-0 top-full mt-2 z-20 w-64 hig-card shadow-elevated border border-rule p-3 flex flex-col gap-2.5"
        >
          <p id={messageId} className="text-hig-footnote text-ink text-left">{message}</p>
          <div className="flex justify-end gap-2">
            <Button ref={cancelRef} type="button" variant="secondary" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="button" variant="danger" size="sm" onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
