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
// Planner output — a lean, AI/dev-actionable ticket.
//
// Shape modelled on Jira FI-3673:
//   - one-line user story (As a / I want to / so I can)
//   - Scope: surfaces / modules the task touches (optional)
//   - Requirements: grouped concrete bullets (the actual work)
//   - Acceptance criteria: short testable bullets (no Gherkin)
//   - Out of scope: explicit boundary (optional, only when useful)
// ---------------------------------------------------------------------------

export const UserStoryFormSchema = z.object({
  asA: z.string().min(1, "userStory.asA is required"),
  iWant: z.string().min(1, "userStory.iWant is required"),
  soThat: z.string().min(1, "userStory.soThat is required"),
});

export const RequirementGroupSchema = z.object({
  category: z.string().min(1, "requirement group category is required"),
  items: z.array(z.string().min(1)).min(1, "requirement group needs at least one item"),
});

export type RequirementGroup = z.infer<typeof RequirementGroupSchema>;

export const StorySchema = z.object({
  title: z.string().min(1, "title is required"),
  userStory: UserStoryFormSchema,
  scope: z.array(z.string().min(1)).default([]),
  requirements: z.array(RequirementGroupSchema).min(1, "at least one requirement group"),
  acceptanceCriteria: z.array(z.string().min(1)).min(1, "at least one acceptance criterion"),
  outOfScope: z.array(z.string().min(1)).default([]),
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
