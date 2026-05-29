import type { Draft } from "@/lib/draft/autosave";
import type { Diagrams, FinalizedPayload } from "@/lib/jobs/types";

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
  // PKO: when set, the orchestrator skips POST /api/finalize and uses this
  // cached payload (produced by the Bake step) for the export call.
  finalizedPayload?: FinalizedPayload;
  // PKO: cached per-task diagrams to attach to the Jira issue.
  diagrams?: Diagrams;
};

export type UploadDestination = {
  cloudId: string;
  projectKey: string;
  issueTypeId: string;
  epic:
    | { kind: "new"; title: string; descriptionHtml?: string; descriptionMarkdown?: string }
    | { kind: "existing"; key: string };
};

export type BatchResult = {
  uploaded: string[];       // task ids that successfully finalized + uploaded
  failedId?: string;
  failedReason?: string;
};
