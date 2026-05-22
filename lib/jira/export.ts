import { buildIssueDescriptionAdf } from "./adf";
import {
  addComment,
  createIssue,
  createIssueLink,
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
  linkResults?: { ok: string[]; failed: Array<{ key: string; error: string }> };
  flagCommentResult?: "ok" | "skipped" | "failed";
  flagCommentError?: string;
  epicCreated?: { key: string };
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

// Resolve the "Epic Link" association for the project. Modern team-managed
// projects expose a `parent` field on every child issue type, while
// classic company-managed projects keep the legacy `customfield_*` whose
// schema.custom URI matches `gh-epic-link`. Returns `null` when neither
// shape is available (e.g. the project doesn't use epics at all).
export function findEpicLinkField(
  fields: Record<string, JiraFieldMeta>,
): { id: string; mode: "parent" | "epic-link" } | null {
  if ("parent" in fields) return { id: "parent", mode: "parent" };
  for (const [id, meta] of Object.entries(fields)) {
    const custom = meta.schema?.custom ?? "";
    if (/epic-link/i.test(custom)) return { id, mode: "epic-link" };
  }
  return null;
}

// The "Flagged" custom field is identified by display name (Atlassian
// doesn't ship a stable custom-schema URI for it across deployments).
// Accept both "Flag" and "Flagged" to tolerate admin renames.
export function findFlaggedField(
  fields: Record<string, JiraFieldMeta>,
): { id: string } | null {
  for (const [id, meta] of Object.entries(fields)) {
    if (/^flag(ged)?$/i.test(meta.name)) return { id };
  }
  return null;
}

// Labels are always the system `labels` field when present on createmeta.
export function findLabelsField(fields: Record<string, JiraFieldMeta>): boolean {
  return "labels" in fields;
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
  let epicField: { id: string; mode: "parent" | "epic-link" } | null = null;
  let flaggedField: { id: string } | null = null;
  let labelsAvailable = false;
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
    epicField = findEpicLinkField(fieldMeta);
    flaggedField = findFlaggedField(fieldMeta);
    labelsAvailable = findLabelsField(fieldMeta);
  } catch (err) {
    console.warn("[jira/export] failed to fetch field metadata, proceeding anyway:", err);
  }

  const metadata = body.metadata;

  // Description source = the markdown the user sees in the preview pane,
  // which may diverge from story.markdown if they edited the textarea after
  // finalize (see AI-34). story.title still drives the Jira summary.
  const descriptionMarkdown = body.payload.markdown;

  // Pull AC out of the markdown body when an AC field exists. Otherwise
  // leave the body intact — the AC will appear in the description.
  const { acSection, bodyWithoutAc } = acField
    ? extractAcceptanceCriteria(descriptionMarkdown)
    : { acSection: null, bodyWithoutAc: descriptionMarkdown };

  const descriptionStory: Story = { ...story, markdown: bodyWithoutAc };
  const adf = buildIssueDescriptionAdf({ story: descriptionStory });

  const fields: Record<string, unknown> = {
    summary: story.title.slice(0, 250),
    project: { key: body.projectKey },
    issuetype: { id: body.issueTypeId },
    description: adf,
  };

  if (metadata?.labels && metadata.labels.length > 0 && labelsAvailable) {
    fields.labels = metadata.labels;
  }

  if (metadata?.epic && metadata.epic.kind === "existing" && epicField) {
    fields[epicField.id] =
      epicField.mode === "parent" ? { key: metadata.epic.key } : metadata.epic.key;
  }

  if (metadata?.flagged && flaggedField) {
    fields[flaggedField.id] = [{ value: "Impediment" }];
  }

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

  // Post-create: issue links + flag comment. Both happen after the main
  // issue exists, never abort the export on failure, and surface their
  // per-step outcomes on the result so the UI can render warnings.
  const linkResults: { ok: string[]; failed: Array<{ key: string; error: string }> } = {
    ok: [],
    failed: [],
  };
  if (metadata?.linkedIssues && metadata.linkedIssues.length > 0) {
    await Promise.all(
      metadata.linkedIssues.map(async (l) => {
        try {
          await createIssueLink(accessToken, body.cloudId, {
            type: { id: l.linkTypeId },
            inwardIssue: { key: l.key },
            outwardIssue: { key: created.key },
          });
          linkResults.ok.push(l.key);
        } catch (err) {
          linkResults.failed.push({
            key: l.key,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }),
    );
  }

  let flagCommentResult: "ok" | "skipped" | "failed" = "skipped";
  let flagCommentError: string | undefined;
  if (metadata?.flagged && metadata.flagReason) {
    try {
      const adfBody = {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: `Flagged: ${metadata.flagReason}` }],
          },
        ],
      };
      await addComment(accessToken, body.cloudId, created.key, adfBody);
      flagCommentResult = "ok";
    } catch (err) {
      flagCommentResult = "failed";
      flagCommentError = err instanceof Error ? err.message : String(err);
    }
  }

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
    linkResults,
    flagCommentResult,
    flagCommentError,
  };
}
