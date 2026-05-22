export type JiraLinkedIssue = {
  key: string;
  title: string;
  linkTypeId: string;
};

export type JiraDraftAttachment = {
  id: string;
  file: File;
};

export type JiraEpicRef =
  | { kind: "existing"; key: string; title: string }
  | { kind: "new"; title: string };

export type JiraMetadata = {
  labels: string[];
  linkedIssues: JiraLinkedIssue[];
  attachments: JiraDraftAttachment[];
  flagged: boolean;
  flagReason?: string;
  epic?: JiraEpicRef;
};

export const EMPTY_METADATA: JiraMetadata = {
  labels: [],
  linkedIssues: [],
  attachments: [],
  flagged: false,
};

export const MAX_DRAFT_ATTACHMENT_BYTES_DEFAULT = 10 * 1024 * 1024;

export const ISSUE_KEY_REGEX = /^[A-Z][A-Z_]*-\d+$/;

export function isValidIssueKey(value: string): boolean {
  return ISSUE_KEY_REGEX.test(value);
}

export function isValidFlagReason(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 3 && trimmed.length <= 500;
}

export function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
}

export function dedupeLabels(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const norm = normalizeLabel(v);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push(v.trim());
  }
  return out;
}
