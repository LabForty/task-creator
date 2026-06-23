import type { Draft } from "@/lib/draft/autosave";
import type { Diagrams, FinalizedPayload } from "@/lib/jobs/types";

// Per-row UI state inside the upload sheet. The orchestrator emits these via
// onRow callbacks so the sheet can show progress without owning the loop.
export type RowState =
  | { kind: "pending" }
  | { kind: "finalizing" }
  | { kind: "uploading" }
  | { kind: "uploaded"; issueKey: string; issueUrl: string }
  | { kind: "already_uploaded"; issueKey: string; issueUrl?: string }
  | { kind: "failed"; reason: string };

export type RowsState = Record<string, RowState>;

export type UploadTask = {
  id: string;
  draft: Draft;
  assignee?: string;
  labels: string[];
  blocks: string[];
  blockedBy: string[];
  uploadedIssueKey?: string;
  uploadedIssueUrl?: string;
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

export type DependencyLinkBase = {
  blockerId: string;
  blockedId: string;
};

export type DependencyLinkResolved = DependencyLinkBase & {
  blockerKey: string;
  blockedKey: string;
};

export type DependencyLinkSkipped = DependencyLinkBase & {
  reason: "missing_issue_key" | "missing_blocks_link_type" | "link_type_load_failed";
};

export type DependencyLinkSummary = {
  ok: DependencyLinkResolved[];
  skipped: DependencyLinkSkipped[];
  failed: Array<DependencyLinkResolved & { error: string }>;
  warning?: string;
};

export type BatchResult = {
  uploaded: string[];       // task ids that successfully finalized + uploaded
  failedId?: string;
  failedReason?: string;
  dependencyLinks?: DependencyLinkSummary;
};
