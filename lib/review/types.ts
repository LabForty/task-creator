// Pure types for per-task review + interference. No SDK/React.
export type ReviewStatus = "pending" | "approved" | "denied" | "change_requested";

export type SubtaskReview = {
  status: ReviewStatus;
  comment: string;
  assignee: string | null;
};

export type ReviewMap = Record<string, SubtaskReview>; // keyed by sub-task id

export const EMPTY_REVIEW: SubtaskReview = { status: "pending", comment: "", assignee: null };

export type InterferenceWarning = { affectedTaskId: string; sourceTaskId: string; reason: string };
export type InterferenceMap = Record<string, InterferenceWarning>; // keyed by affectedTaskId
