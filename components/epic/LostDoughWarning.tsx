"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

type Props = {
  onConfirm: (keepAnswers: boolean) => void;
  onCancel: () => void;
};

export function LostDoughWarning({ onConfirm, onCancel }: Props) {
  const [keep, setKeep] = useState(false);
  return (
    <div className="rounded-md bg-warning-tint border border-warning/40 px-4 py-3 flex flex-col gap-3" role="alert">
      <p className="text-hig-footnote text-ink">
        You edited the epic description after kneading. Re-kneading discards the current dough —
        all questions and answers will be lost.
      </p>
      <label className="flex items-center gap-2 text-hig-footnote text-ink">
        <input
          type="checkbox"
          checked={keep}
          onChange={(e) => setKeep(e.target.checked)}
          className="accent-accent"
        />
        Keep already-answered questions for the next run
      </label>
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={() => onConfirm(keep)}>Re-knead</Button>
        <Button type="button" size="sm" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
