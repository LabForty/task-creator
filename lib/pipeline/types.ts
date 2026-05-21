import { z } from "zod";

// ---------------------------------------------------------------------------
// User-authored draft (the input to the pipeline).
// ---------------------------------------------------------------------------

export type DraftInput = {
  title: string;
  description: string;
  useCases?: string;
  acceptanceCriteria?: string[];
  constraints?: string;
  // Slug of the selected task-type template (matches a file in prompts/types/).
  // Optional — the planner falls back to the in-repo default when absent.
  taskType?: string;
};

// ---------------------------------------------------------------------------
// Analyst output — a structured requirement analysis.
// ---------------------------------------------------------------------------

export const RequirementSchema = z.object({
  title: z.string().min(1, "title is required"),
  summary: z.string().min(1, "summary is required"),
  problem: z.string().min(1, "problem is required"),
  value: z.string().min(1, "value is required"),
  acceptanceCriteria: z.array(z.string().min(1)).min(1, "at least one acceptance criterion is required"),
  outOfScope: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
});

export type Requirement = z.infer<typeof RequirementSchema>;

// ---------------------------------------------------------------------------
// Planner output — title + the fully-rendered ticket markdown.
//
// The shape, sections, and tone of the ticket are dictated by the selected
// task-type template (synced daily from the workflow service). The planner
// is responsible for following that template; we just check we got a title
// and non-empty markdown back.
// ---------------------------------------------------------------------------

export const StorySchema = z.object({
  title: z.string().min(1, "title is required"),
  markdown: z.string().min(1, "markdown is required"),
});

export type Story = z.infer<typeof StorySchema>;

// ---------------------------------------------------------------------------
// Gate result — typed for the UI event bus. These reflect in-process Zod
// schema validation (analyst / planner output) and the deterministic
// consistency check between the analysis and the user story.
// ---------------------------------------------------------------------------

export type GateName = "schema" | "consistency";

export type GateResult =
  | { gate: GateName; ok: true }
  | { gate: GateName; ok: false; errors: string[] };

export type FinalizedArtifacts = { requirement: Requirement; story: Story };
