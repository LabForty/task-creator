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
// Planner output — a Jira-ready user story with Gherkin AC + DoD.
// ---------------------------------------------------------------------------

export const GherkinScenarioSchema = z.object({
  title: z.string().min(1, "scenario title is required"),
  given: z.array(z.string().min(1)).min(1, "at least one Given clause"),
  when: z.array(z.string().min(1)).min(1, "at least one When clause"),
  then: z.array(z.string().min(1)).min(1, "at least one Then clause"),
});

export type GherkinScenario = z.infer<typeof GherkinScenarioSchema>;

export const UserStoryFormSchema = z.object({
  asA: z.string().min(1, "userStory.asA is required"),
  iWant: z.string().min(1, "userStory.iWant is required"),
  soThat: z.string().min(1, "userStory.soThat is required"),
});

export const StorySchema = z.object({
  title: z.string().min(1, "title is required"),
  userStory: UserStoryFormSchema,
  description: z.string().min(1, "description is required"),
  acceptanceCriteria: z.array(GherkinScenarioSchema).min(1, "at least one Gherkin scenario"),
  definitionOfDone: z.array(z.string().min(1)).min(1, "at least one DoD bullet"),
  notes: z.string().optional().default(""),
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
