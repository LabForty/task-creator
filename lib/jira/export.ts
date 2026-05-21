import { buildIssueDescriptionAdf } from "./adf";
import {
  createIssue,
  listCreateFields,
  uploadAttachment,
  type JiraFieldMeta,
} from "./client";
import { listAccessibleResources } from "./oauth";
import type { ExportBody } from "./schemas";
import { extractAcceptanceCriteria } from "@/lib/markdown/extractAc";
import { markdownToAdf } from "@/lib/markdown/toAdf";
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

// In Jira Cloud REST v3, rich-text custom fields (textarea-style) expect
// ADF documents. Single-line "textfield" customs take a plain string. We
// default to ADF unless the schema's `custom` URI ends in `:textfield`.
function fieldExpectsAdf(meta: JiraFieldMeta): boolean {
  const custom = meta.schema?.custom ?? "";
  if (/:textfield(?:$|;)/i.test(custom)) return false;
  return true;
}

// Match anything that names an "Acceptance Criteria" field — Jira admins
// often spell it slightly differently per project ("Acceptance criteria",
// "Acceptance Criterion", "Acceptance-Criteria"). Hyphens, dashes, and
// extra whitespace are all OK.
function isAcField(meta: JiraFieldMeta): boolean {
  return /accept(ance)?[\s-]?criteri/i.test(meta.name);
}

// Convert the captured AC chunk to a flat plain-text list for textfield-
// style fields. Strips fenced code, headings, and bold markers.
function acAsPlainText(acMarkdown: string): string {
  return acMarkdown
    .split("\n")
    .map((l) => l.replace(/^\s*[-*]\s+/, "- ").replace(/^\s*\d+[.)]\s+/, (m) => m.trim() + " "))
    .map((l) => l.replace(/\*\*([^*]+)\*\*/g, "$1"))
    .join("\n")
    .trim();
}

// System fields we already populate explicitly — never auto-route AC into
// these even if their display name happens to match.
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

  // Discover the project's createmeta so we can route the Acceptance
  // criteria section into a dedicated custom field if one exists. This
  // mirrors the field-discovery flow the app had before the
  // markdown-only refactor: if there's an AC field, fill it AND strip
  // the section from the description so the content isn't duplicated.
  const autoFilled: string[] = [];
  const missingRequired: string[] = [];
  let acField: { id: string; meta: JiraFieldMeta } | null = null;
  try {
    const fieldMeta = await listCreateFields(
      accessToken,
      body.cloudId,
      body.projectKey,
      body.issueTypeId,
    );
    for (const [id, meta] of Object.entries(fieldMeta)) {
      if (SYSTEM_FIELDS_WE_HANDLE.has(id)) continue;
      if (isAcField(meta) && !acField) {
        acField = { id, meta };
        continue;
      }
      if (meta.required) missingRequired.push(`${meta.name} (${id})`);
    }
  } catch (err) {
    console.warn("[jira/export] failed to fetch field metadata, proceeding anyway:", err);
  }

  // Pull AC out of the markdown body when an AC field exists. Otherwise
  // leave the body intact — the AC will appear in the description.
  const { acSection, bodyWithoutAc } = acField
    ? extractAcceptanceCriteria(story.markdown)
    : { acSection: null, bodyWithoutAc: story.markdown };

  const descriptionStory: Story = acField && acSection
    ? { ...story, markdown: bodyWithoutAc }
    : story;
  const adf = buildIssueDescriptionAdf({ story: descriptionStory });

  const fields: Record<string, unknown> = {
    summary: story.title.slice(0, 250),
    project: { key: body.projectKey },
    issuetype: { id: body.issueTypeId },
    description: adf,
  };

  if (acField && acSection) {
    const value = fieldExpectsAdf(acField.meta)
      ? markdownToAdf(acSection)
      : acAsPlainText(acSection);
    fields[acField.id] = value;
    autoFilled.push(`${acField.meta.name} (${acField.id})`);
  }

  let created;
  try {
    created = await createIssue(accessToken, body.cloudId, fields);
  } catch (err) {
    // Re-throw — caller surfaces the message. Augment with field-meta hint
    // if Jira likely rejected for a missing required custom field.
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
