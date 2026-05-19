import { z } from "zod";
import { MermaidFormatSchema } from "@/lib/api/schemas";
import { StorySchema } from "@/lib/pipeline";

export const ExportPayloadSchema = z.object({
  story: StorySchema,
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
