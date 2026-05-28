import type { Draft } from "@/lib/draft/autosave";

// Per-row UI state inside the upload sheet. The orchestrator emits these via
// onRow callbacks so the sheet can show progress without owning the loop.
export type RowState =
  | { kind: "pending" }
  | { kind: "finalizing" }
  | { kind: "uploading" }
  | { kind: "uploaded"; issueKey: string; issueUrl: string }
  | { kind: "failed"; reason: string };

export type RowsState = Record<string, RowState>;

export type UploadTask = {
  id: string;
  draft: Draft;
  assignee?: string;
  labels: string[];
};

export type UploadDestination = {
  cloudId: string;
  projectKey: string;
  issueTypeId: string;
  parentEpicKey?: string;
};

export type BatchResult = {
  uploaded: string[];       // task ids that successfully finalized + uploaded
  failedId?: string;
  failedReason?: string;
};
