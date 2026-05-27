"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField, TextArea } from "@/components/ui/TextField";
import type { SubtaskReview } from "@/lib/review/types";

type Props = { review: SubtaskReview; onChange: (patch: Partial<SubtaskReview>) => void };

export function ReviewControls({ review, onChange }: Props) {
  const [requesting, setRequesting] = useState(false);
  const [draftComment, setDraftComment] = useState(review.comment);
  const [assignee, setAssignee] = useState(review.assignee ?? "");

  function applyChangeRequested() {
    const c = draftComment.trim();
    if (!c) return;
    onChange({ status: "change_requested", comment: c });
    setRequesting(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Button type="button" size="sm" variant={review.status === "approved" ? "primary" : "secondary"} onClick={() => { setRequesting(false); onChange({ status: "approved" }); }}>Approve</Button>
        <Button type="button" size="sm" variant={review.status === "denied" ? "danger" : "secondary"} onClick={() => { setRequesting(false); onChange({ status: "denied" }); }}>Deny</Button>
        <Button type="button" size="sm" variant={review.status === "change_requested" ? "primary" : "secondary"} onClick={() => setRequesting(true)}>Change requested</Button>
      </div>

      {requesting && (
        <div className="flex flex-col gap-2 rounded-md bg-warning-tint border border-warning/40 p-2">
          <TextArea label="Comment (required)" value={draftComment} onChange={(e) => setDraftComment(e.target.value)} className="min-h-[60px]" />
          <div>
            <Button type="button" size="sm" onClick={applyChangeRequested} disabled={!draftComment.trim()}>Apply change request</Button>
          </div>
        </div>
      )}

      {!requesting && review.comment && (
        <p className="text-hig-footnote text-ink-secondary">Comment: {review.comment}</p>
      )}

      <TextField
        label="Assignee"
        value={assignee}
        onChange={(e) => { setAssignee(e.target.value); onChange({ assignee: e.target.value || null }); }}
        placeholder="name or email"
      />
    </div>
  );
}
