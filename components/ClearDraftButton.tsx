"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

type Props = {
  onConfirm: () => void;
  label?: string;
  disabled?: boolean;
};

export function ClearDraftButton({ onConfirm, label = "Clear", disabled = false }: Props) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="md"
        disabled={disabled}
        onClick={() => setConfirming(true)}
      >
        {label}
      </Button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-hig-footnote text-ink-secondary">Clear this draft?</span>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => {
          setConfirming(false);
          onConfirm();
        }}
      >
        Yes
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        No
      </Button>
    </span>
  );
}
