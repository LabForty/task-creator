import type { Requirement, Story, GherkinScenario } from "@/lib/pipeline";

export type DraftRenderInput = { constraints?: string };

function renderUserStoryLine(story: Story): string {
  const { asA, iWant, soThat } = story.userStory;
  return `**As a** ${asA.trim()}, **I want** ${iWant.trim()}, **so that** ${soThat.trim()}.`;
}

function renderGherkinScenario(s: GherkinScenario): string {
  const lines: string[] = [`### ${s.title}`];
  s.given.forEach((g, i) => lines.push(`- ${i === 0 ? "**Given**" : "**And**"} ${g}`));
  s.when.forEach((w, i) => lines.push(`- ${i === 0 ? "**When**" : "**And**"} ${w}`));
  s.then.forEach((t, i) => lines.push(`- ${i === 0 ? "**Then**" : "**And**"} ${t}`));
  return lines.join("\n");
}

// Render the finalized story as Jira-ready markdown. Shape:
//
//   # <title>
//
//   **As a <role>, I want <action>, so that <benefit>.**
//
//   ## Description
//   <description body — primary/alt/edge/testing inline>
//
//   ## Constraints           (optional)
//   <constraint text>
//
//   ## Acceptance Criteria
//   ### Scenario 1
//   - **Given** ...
//   - **When** ...
//   - **Then** ...
//
//   ## Definition of Done
//   - item
//   - item
//
//   ## Notes                 (optional)
//   <free text>
export function renderFinalized(_req: Requirement, story: Story, draft: DraftRenderInput): string {
  const sections: string[] = [];

  sections.push(`# ${story.title}`);
  sections.push(renderUserStoryLine(story));
  sections.push(`## Description\n${story.description.trim()}`);

  if (draft.constraints?.trim()) {
    sections.push(`## Constraints\n${draft.constraints.trim()}`);
  }

  const ac = story.acceptanceCriteria.map(renderGherkinScenario).join("\n\n");
  sections.push(`## Acceptance Criteria\n${ac}`);

  const dod = story.definitionOfDone.map((d) => `- ${d}`).join("\n");
  sections.push(`## Definition of Done\n${dod}`);

  if (story.notes && story.notes.trim()) {
    sections.push(`## Notes\n${story.notes.trim()}`);
  }

  return sections.join("\n\n");
}
