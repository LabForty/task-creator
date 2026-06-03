import { z } from "zod";

// Loose, save-time schema: every field optional, no min(1). Partial and empty
// input is preserved exactly. Bounds are size guards only, not requirements.
export const DraftUpsertSchema = z.object({
  title: z.string().max(200).optional(),
  description: z.string().max(50_000).optional(),
  acceptanceCriteria: z.array(z.string().max(2_000)).max(100).optional(),
  constraints: z.string().max(20_000).optional(),
  taskType: z.string().max(64).optional(),
  diagrams: z.unknown().optional(),
  chatHistory: z.unknown().optional(),
  // Forward-compat: accepted but unused until epic drafts land.
  mode: z.enum(["single", "epic"]).optional(),
});

export const DraftUpsertBodySchema = z.object({ draft: DraftUpsertSchema });

export type DraftUpsertInput = z.infer<typeof DraftUpsertSchema>;
