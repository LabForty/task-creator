"use client";

import { useState } from "react";
import { FlagReasonModal } from "./FlagReasonModal";

type Value = { flagged: false } | { flagged: true; flagReason: string };

type Props = {
  value: Value;
  onChange: (next: Value) => void;
  disabled?: boolean;
};

export function FlagField({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState<null | "edit" | "view">(null);

  function onToggle() {
    if (value.flagged) {
      onChange({ flagged: false });
    } else {
      setOpen("edit");
    }
  }

  return (
    <div className="flex flex-col gap-1.5" data-field="flag">
      <label className="text-hig-subhead font-medium text-ink">Flag</label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={value.flagged}
          aria-label="Flag this task"
          onClick={onToggle}
          disabled={disabled}
          className={
            "px-3 py-1.5 rounded-md text-hig-subhead border " +
            (value.flagged
              ? "bg-warn-tint text-warn border-warn"
              : "border-rule")
          }
        >
          {value.flagged ? "⚑ Flagged" : "Set flag"}
        </button>
        {value.flagged && (
          <button
            type="button"
            onClick={() => setOpen("view")}
            className="text-hig-footnote underline text-ink-secondary"
          >
            View reason
          </button>
        )}
      </div>
      {open === "edit" && (
        <FlagReasonModal
          onConfirm={(reason) => {
            setOpen(null);
            onChange({ flagged: true, flagReason: reason });
          }}
          onCancel={() => setOpen(null)}
        />
      )}
      {open === "view" && value.flagged && (
        <FlagReasonModal
          initial={value.flagReason}
          readOnly
          onConfirm={() => setOpen(null)}
          onCancel={() => setOpen(null)}
        />
      )}
    </div>
  );
}
