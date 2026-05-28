"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

type Props = {
  label: string;
  confirmMessage?: string;
  onBack: () => void;
};

export function BackBar({ label, confirmMessage, onBack }: Props) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <div className="flex items-center">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => (confirmMessage ? setConfirming(true) : onBack())}
        >
          <span aria-hidden="true">←</span>
          {label}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md bg-warning-tint border border-warning/40 px-3 py-2">
      <span className="text-hig-footnote text-ink flex-1">{confirmMessage}</span>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => {
          setConfirming(false);
          onBack();
        }}
      >
        Yes
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </div>
  );
}
