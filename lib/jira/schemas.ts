import { z } from "zod";
import { MermaidFormatSchema } from "@/lib/api/schemas";
import { StorySchema } from "@/lib/pipeline";
import { ISSUE_KEY_REGEX } from "./metadata";

export const ExportPayloadSchema = z.object({
  story: StorySchema,
  // The markdown the user sees in the preview pane — may diverge from
  // story.markdown if they edited the textarea after finalize. This is the
  // source of truth for the issue description; story.markdown is kept only
  // because story.title still drives the Jira summary.
  markdown: z.string().min(1, "markdown is required"),
  constraints: z.string().optional(),
});

export const MetadataSchema = z
  .object({
    labels: z.array(z.string().trim().min(1).max(255)).max(50).optional(),
    linkedIssues: z
      .array(
        z.object({
          key: z.string().regex(ISSUE_KEY_REGEX),
          linkTypeId: z.string().min(1),
        }),
      )
      .max(50)
      .optional(),
    flagged: z.boolean().optional(),
    flagReason: z.string().trim().min(3).max(500).optional(),
    epic: z
      .discriminatedUnion("kind", [
        z.object({ kind: z.literal("existing"), key: z.string().regex(ISSUE_KEY_REGEX) }),
        z.object({ kind: z.literal("new"), title: z.string().trim().min(1).max(255) }),
      ])
      .optional(),
  })
  .refine((m) => !m.flagged || (m.flagReason !== undefined && m.flagReason.trim().length >= 3), {
    message: "flagReason is required when flagged is true",
    path: ["flagReason"],
  });

export const ExportBodySchema = z.object({
  cloudId: z.string().min(1),
  projectKey: z.string().min(1),
  issueTypeId: z.string().min(1),
  payload: ExportPayloadSchema,
  diagrams: z.partialRecord(MermaidFormatSchema, z.string()).optional(),
  metadata: MetadataSchema.optional(),
});

export type ExportBody = z.infer<typeof ExportBodySchema>;
export type ExportPayload = z.infer<typeof ExportPayloadSchema>;
export type ExportMetadata = z.infer<typeof MetadataSchema>;
