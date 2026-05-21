import { buildIssueDescriptionAdf } from "./adf";
import {
  createIssue,
  uploadAttachment,
} from "./client";
import { listAccessibleResources } from "./oauth";
import type { ExportBody } from "./schemas";
import type { Story } from "@/lib/pipeline";
import type { MermaidFormat } from "@/lib/jobs/types";

export type ExportResult = {
  key: string;
  url: string;
  attachments: Partial<Record<MermaidFormat, "ok" | "failed">>;
  attachmentErrors: Partial<Record<MermaidFormat, string>>;
  autoFilledFields: string[];
  missingRequiredFields: string[];
};

export async function exportToJira(
  accessToken: string,
  body: ExportBody,
): Promise<ExportResult> {
  const story: Story = body.payload.story;

  // With the template-driven pipeline the planner produces the entire
  // ticket body as markdown — the description ADF is its faithful
  // conversion. We no longer auto-fill the project's "Acceptance Criteria"
  // custom field separately because there is no structured AC list to
  // route there; whatever AC the template wants lives inside the body.
  const adf = buildIssueDescriptionAdf({ story });

  const fields: Record<string, unknown> = {
    summary: story.title.slice(0, 250),
    project: { key: body.projectKey },
    issuetype: { id: body.issueTypeId },
    description: adf,
  };

  const created = await createIssue(accessToken, body.cloudId, fields);

  let siteUrl = "";
  try {
    const resources = await listAccessibleResources(accessToken);
    siteUrl = resources.find((r) => r.id === body.cloudId)?.url ?? "";
  } catch {
    /* fall through with empty siteUrl */
  }
  const url = siteUrl
    ? `${siteUrl.replace(/\/$/, "")}/browse/${created.key}`
    : `https://www.atlassian.com/`;

  const attachments: ExportResult["attachments"] = {};
  const attachmentErrors: ExportResult["attachmentErrors"] = {};

  if (body.diagrams) {
    const formats: MermaidFormat[] = ["flow", "sequence", "interaction"];
    for (const f of formats) {
      const src = body.diagrams[f];
      if (!src || src.trim().length === 0) continue;
      try {
        await uploadAttachment(accessToken, body.cloudId, created.key, `${f}.mmd`, src);
        attachments[f] = "ok";
      } catch (err) {
        attachments[f] = "failed";
        attachmentErrors[f] = err instanceof Error ? err.message : String(err);
      }
    }
  }

  return {
    key: created.key,
    url,
    attachments,
    attachmentErrors,
    autoFilledFields: [],
    missingRequiredFields: [],
  };
}
