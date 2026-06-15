"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { ReviewStatus } from "@/lib/epic/tasks";

type Props = {
  status?: ReviewStatus;
  comment: string;
  onStatusChange: (status: ReviewStatus) => void;
  onCommentChange: (comment: string) => void;
};

export function TaskReviewBar({ status, comment, onStatusChange, onCommentChange }: Props) {
  const [commentError, setCommentError] = useState(false);

  function pick(next: ReviewStatus) {
    // Change-requested must carry a comment before it can be applied.
    if (next === "change_requested" && comment.trim().length === 0) {
      setCommentError(true);
      return;
    }
    setCommentError(false);
    onStatusChange(next);
  }

  return (
    <div className="flex flex-col gap-2 shrink-0 border-b border-rule pb-3">
      <div className="flex items-center gap-2">
        <span className="hig-section-label">Review</span>
        <span className="flex-1" />
        <Button
          size="sm"
          variant={status === "approved" ? "success" : "secondary"}
          aria-pressed={status === "approved"}
          onClick={() => pick("approved")}
        >
          Approve
        </Button>
        <Button
          size="sm"
          variant={status === "denied" ? "warning" : "secondary"}
          aria-pressed={status === "denied"}
          onClick={() => pick("denied")}
        >
          Deny
        </Button>
        <Button
          size="sm"
          variant={status === "change_requested" ? "danger" : "secondary"}
          aria-pressed={status === "change_requested"}
          onClick={() => pick("change_requested")}
        >
          Request change
        </Button>
      </div>
      <textarea
        value={comment}
        aria-label="Review comment"
        placeholder="Add a comment (required to request changes)…"
        onChange={(e) => {
          onCommentChange(e.target.value);
          if (commentError && e.target.value.trim().length > 0) setCommentError(false);
        }}
        className="w-full min-h-[60px] rounded-md border border-rule bg-surface px-3 py-2 text-hig-body resize-y"
      />
      {commentError && (
        <p className="text-hig-footnote text-danger-strong">A comment is required to request changes.</p>
      )}
    </div>
  );
}
