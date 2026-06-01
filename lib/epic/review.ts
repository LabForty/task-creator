import type { EpicTask, ReviewStatus } from "@/lib/epic/tasks";

// Pure transforms over the epic-task descriptor list, mirroring lib/epic/tasks.ts.
// Review status + comment live on EpicTask itself, so these ride the existing
// draft autosave with no extra persistence wiring.

export function setReviewStatus(list: EpicTask[], id: string, status: ReviewStatus): EpicTask[] {
  return list.map((t) => (t.id === id ? { ...t, reviewStatus: status } : t));
}

export function setReviewComment(list: EpicTask[], id: string, comment: string): EpicTask[] {
  return list.map((t) => (t.id === id ? { ...t, reviewComment: comment } : t));
}

// Upload is gated until every task is explicitly resolved. change_requested and
// unreviewed both keep the gate closed; an empty list is never "complete".
export function isReviewComplete(tasks: EpicTask[]): boolean {
  return tasks.length > 0 && tasks.every((t) => t.reviewStatus === "approved" || t.reviewStatus === "denied");
}

export function tasksForUpload(tasks: EpicTask[]): EpicTask[] {
  return tasks.filter((t) => t.reviewStatus === "approved");
}

export function deniedTasks(tasks: EpicTask[]): { id: string; title: string }[] {
  return tasks.filter((t) => t.reviewStatus === "denied").map((t) => ({ id: t.id, title: t.title }));
}
