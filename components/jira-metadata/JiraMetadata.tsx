"use client";

import { useEffect, useRef } from "react";
import type { JiraMetadata as JiraMetadataValue } from "@/lib/jira/metadata";
import { LabelsField } from "./LabelsField";
import { LinkedIssuesField } from "./LinkedIssuesField";
import { AttachmentsField } from "./AttachmentsField";
import { FlagField } from "./FlagField";
import { EpicField } from "./EpicField";

type Props = {
  cloudId: string | null;
  projectKey: string | null;
  issueTypeId?: string | null;
  value: JiraMetadataValue;
  onChange: (next: JiraMetadataValue) => void;
  maxAttachmentBytes?: number;
  disabled?: boolean;
};

export function JiraMetadata({
  cloudId, projectKey, value, onChange, maxAttachmentBytes, disabled,
}: Props) {
  // When project changes, clear labels + epic. Labels search is keyed off
  // cloudId only, but selected labels often don't make sense across projects;
  // epics are strictly per-project.
  const prevProject = useRef<string | null>(projectKey);
  useEffect(() => {
    if (prevProject.current !== null && prevProject.current !== projectKey) {
      onChange({ ...value, labels: [], epic: undefined });
    }
    prevProject.current = projectKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectKey]);

  if (!cloudId || !projectKey) {
    return (
      <p className="text-hig-footnote text-ink-secondary">
        Pick a project to add labels, linked issues, attachments, a flag, or an epic.
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-4 border-t border-rule pt-4 mt-2" aria-label="Jira metadata">
      <LabelsField
        cloudId={cloudId}
        value={value.labels}
        onChange={(labels) => onChange({ ...value, labels })}
        disabled={disabled}
      />
      <LinkedIssuesField
        cloudId={cloudId}
        projectKey={projectKey}
        value={value.linkedIssues}
        onChange={(linkedIssues) => onChange({ ...value, linkedIssues })}
        disabled={disabled}
      />
      <AttachmentsField
        value={value.attachments}
        onChange={(attachments) => onChange({ ...value, attachments })}
        maxBytes={maxAttachmentBytes}
        disabled={disabled}
      />
      <FlagField
        value={value.flagged ? { flagged: true, flagReason: value.flagReason ?? "" } : { flagged: false }}
        onChange={(next) => onChange(
          next.flagged
            ? { ...value, flagged: true, flagReason: next.flagReason }
            : { ...value, flagged: false, flagReason: undefined },
        )}
        disabled={disabled}
      />
      <EpicField
        cloudId={cloudId}
        projectKey={projectKey}
        value={value.epic}
        onChange={(epic) => onChange({ ...value, epic })}
        disabled={disabled}
      />
    </section>
  );
}
