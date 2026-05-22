import { z } from "zod";
import { MermaidFormatSchema } from "@/lib/api/schemas";
import { StorySchema } from "@/lib/pipeline";

export const ExportPayloadSchema = z.object({
  story: StorySchema,
  // The markdown the user sees in the preview pane — may diverge from
  // story.markdown if they edited the textarea after finalize. This is the
  // source of truth for the issue description; story.markdown is kept only
  // because story.title still drives the Jira summary.
  markdown: z.string().min(1, "markdown is required"),
  constraints: z.string().optional(),
});

export const ExportBodySchema = z.object({
  cloudId: z.string().min(1),
  projectKey: z.string().min(1),
  issueTypeId: z.string().min(1),
  payload: ExportPayloadSchema,
  diagrams: z.partialRecord(MermaidFormatSchema, z.string()).optional(),
});

export type ExportBody = z.infer<typeof ExportBodySchema>;
export type ExportPayload = z.infer<typeof ExportPayloadSchema>;
