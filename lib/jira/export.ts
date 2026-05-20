import { buildIssueDescriptionAdf } from "./adf";
import {
  createIssue,
  listCreateFields,
  uploadAttachment,
  type JiraFieldMeta,
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

// Plain-text rendering of acceptance criteria for custom fields with type:string.
function acAsPlainText(items: string[]): string {
  return items.map((s) => `- ${s.trim()}`).join("\n");
}

// ADF rendering of acceptance criteria for custom fields with type:doc.
function acAsAdf(items: string[]) {
  return {
    version: 1,
    type: "doc",
    content: [
      {
        type: "bulletList",
        content: items.map((item) => ({
          type: "listItem",
          content: [
            { type: "paragraph", content: [{ type: "text", text: item.trim() }] },
          ],
        })),
      },
    ],
  };
}

function fieldExpectsAdf(meta: JiraFieldMeta): boolean {
  // In Jira Cloud REST v3, all rich-text fields (including textarea custom
  // fields) require ADF. Only single-line textfield-style custom fields take
  // plain string. Default to ADF unless we recognize the textfield marker.
  const custom = meta.schema?.custom ?? "";
  if (/:textfield(?:$|;)/i.test(custom)) return false;
  return true;
}

function isAcField(meta: JiraFieldMeta): boolean {
  return /accept(ance)?[\s-]?criteri/i.test(meta.name);
}

const SYSTEM_FIELDS_WE_HANDLE = new Set([
  "summary",
  "issuetype",
  "project",
  "description",
  "reporter", // Jira fills this automatically
]);

export async function exportToJira(
  accessToken: string,
  body: ExportBody,
): Promise<ExportResult> {
  const story: Story = body.payload.story;

  // Discover required fields first so we know whether this project has its
  // own Acceptance Criteria custom field. If it does, we drop AC from the
  // description body to avoid duplicating it in both places.
  const autoFilled: string[] = [];
  const missingRequired: string[] = [];
  const acFieldFills: { id: string; value: unknown; label: string }[] = [];
  try {
    const fieldMeta = await listCreateFields(
      accessToken,
      body.cloudId,
      body.projectKey,
      body.issueTypeId,
    );
    for (const [id, meta] of Object.entries(fieldMeta)) {
      if (!meta.required) continue;
      if (SYSTEM_FIELDS_WE_HANDLE.has(id)) continue;

      if (isAcField(meta)) {
        const value = fieldExpectsAdf(meta)
          ? acAsAdf(story.acceptanceCriteria)
          : acAsPlainText(story.acceptanceCriteria);
        acFieldFills.push({ id, value, label: `${meta.name} (${id})` });
        continue;
      }
      missingRequired.push(`${meta.name} (${id})`);
    }
  } catch (err) {
    console.warn("[jira/export] failed to fetch field metadata, proceeding anyway:", err);
  }

  const adf = buildIssueDescriptionAdf({
    story,
    constraints: body.payload.constraints,
    includeAcceptanceCriteria: acFieldFills.length === 0,
  });

  const fields: Record<string, unknown> = {
    summary: story.title.slice(0, 250),
    project: { key: body.projectKey },
    issuetype: { id: body.issueTypeId },
    description: adf,
  };
  for (const { id, value, label } of acFieldFills) {
    if (fields[id] !== undefined) continue;
    fields[id] = value;
    autoFilled.push(label);
  }

  let created;
  try {
    created = await createIssue(accessToken, body.cloudId, fields);
  } catch (err) {
    // Re-throw — caller surfaces the message. We add a hint about missing
    // fields if we have one.
    if (missingRequired.length > 0) {
      const hint = ` (Jira also flagged these required fields we couldn't auto-fill: ${missingRequired.join(", ")})`;
      const original = err instanceof Error ? err.message : String(err);
      const augmented = new Error(original + hint);
      Object.assign(augmented, err as object);
      throw augmented;
    }
    throw err;
  }

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
    autoFilledFields: autoFilled,
    missingRequiredFields: missingRequired,
  };
}
