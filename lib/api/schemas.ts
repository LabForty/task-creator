import { z } from "zod";
import { KneadQuestionSchema } from "@/lib/knead/parse";

export const DraftSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  acceptanceCriteria: z.array(z.string()).optional(),
  constraints: z.string().optional(),
  taskType: z.string().min(1).max(64).optional(),
});

// Looser shape for title-suggest — title can be empty (that's the whole point).
export const PartialDraftSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  acceptanceCriteria: z.array(z.string()).optional(),
  constraints: z.string().optional(),
});

export const TitleSuggestBodySchema = z.object({
  draft: PartialDraftSchema,
});

export const FinalizeBodySchema = z.object({
  draft: DraftSchema,
  options: z
    .object({
      stakeholder: z.string().optional(),
      glossarySeed: z.array(z.string()).optional(),
    })
    .optional(),
});

// Create Diagrams takes the FINALIZED artifacts (Requirement + Story) and the
// original draft. We accept Requirement + Story as untyped objects here; the
// orchestrator passes them to Claude as JSON. The Zod schemas in lib/pipeline
// already validate them at the orchestrator boundary.
export const MermaidFormatSchema = z.enum(["flow", "sequence", "interaction"]);

export const CreateDiagramsBodySchema = z.object({
  requirement: z.unknown(),
  story: z.unknown(),
  draft: DraftSchema,
  formats: z.array(MermaidFormatSchema).optional(),
});

export const AnalyzeDiagramsBodySchema = z.object({
  requirement: z.unknown(),
  story: z.unknown(),
  mermaid: z.record(MermaidFormatSchema, z.string()),
});

export const HelpBodySchema = z.object({
  surface: z.enum(["editor", "diagrams"]),
  state: z.object({
    draft: DraftSchema,
    diagrams: z.record(MermaidFormatSchema, z.string()).optional(),
  }),
  conversation: z.array(
    z.object({ role: z.enum(["user", "assistant"]), text: z.string() }),
  ),
});

export const KneadRoundSchema = z.object({
  questions: z.array(KneadQuestionSchema),
  answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
});

export const KneadBodySchema = z.object({
  epicDescription: z.string().min(1),
  rounds: z.array(KneadRoundSchema),
  overrideCapApproved: z.boolean().optional(),
});

export type KneadBody = z.infer<typeof KneadBodySchema>;

export const SubtasksBodySchema = z.object({
  epicDescription: z.string().min(1),
  rounds: z.array(KneadRoundSchema),
});
export type SubtasksBody = z.infer<typeof SubtasksBodySchema>;

const SubTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  labels: z.array(z.string()),
  blocks: z.array(z.string()),
  blockedBy: z.array(z.string()),
});

export const InterferenceBodySchema = z.object({
  epicDescription: z.string().min(1),
  editedSubtask: SubTaskSchema,
  allSubtasks: z.array(SubTaskSchema),
});
export type InterferenceBody = z.infer<typeof InterferenceBodySchema>;

export type DraftPayload = z.infer<typeof DraftSchema>;
export type FinalizeBody = z.infer<typeof FinalizeBodySchema>;
export type CreateDiagramsBody = z.infer<typeof CreateDiagramsBodySchema>;
export type AnalyzeDiagramsBody = z.infer<typeof AnalyzeDiagramsBodySchema>;
export type HelpBody = z.infer<typeof HelpBodySchema>;
export type TitleSuggestBody = z.infer<typeof TitleSuggestBodySchema>;
