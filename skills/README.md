# Claude Skills — directory contract

Every AI action this webapp performs is the execution of a **Claude Skill** or a **role prompt** in `prompts/` — never inline application logic.

## Where prompts live

| Action | Prompt file (path inside repo) |
| --- | --- |
| Finalize Task → Requirement analysis | `prompts/analyst.md` |
| Finalize Task → User Story | `prompts/planner.md` |
| Help (clarification chat) | `skills/task-help/SKILL.md` |
| Create Diagrams (Mermaid AI) | `skills/task-create-diagrams/SKILL.md` |
| Analyze Diagrams (text↔diagram consistency) | `skills/task-analyze-diagrams/SKILL.md` |
| Suggest Title | `skills/task-title-suggest/SKILL.md` |

## Rules

1. **`lib/agent` is the only module that talks to Claude.** API routes, React components, and business code never embed prompt strings or model IDs.
2. **Webapp-owned Skills go here** (`skills/<skill-name>/SKILL.md`) and follow the standard Claude Skills format (frontmatter `name` + `description`, then the prompt body).
3. **Role prompts (analyst, planner) live in `prompts/`** as plain markdown. They are loaded by file name (`analyst.md`, `planner.md`).
4. **Prompts are loaded at runtime**, not bundled. `lib/agent` reads the .md file fresh on each invocation, then passes it as the system prompt to `@anthropic-ai/claude-agent-sdk`'s `query()`.
5. **A pull request that puts AI prompts anywhere else fails review.** This is a hard architectural invariant.
