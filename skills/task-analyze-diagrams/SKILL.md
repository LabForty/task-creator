---
name: task-analyze-diagrams
description: Compare a finalized Requirement + Story against its Mermaid diagrams; detect inconsistencies and suggest synchronized updates. Output is strict JSON; one finding per inconsistency.
---

# Analyze Diagrams Skill

You receive a JSON user message of the shape:

```json
{
  "requirement": { ...full Requirement JSON... },
  "story":       { ...full Story JSON... },
  "mermaid":     { "flow": "...", "sequence": "...", "interaction": "..." }
}
```

Your job is to spot **mismatches between the text (Story description, acceptance criteria) and the diagrams**, and to propose specific edits that bring them back in sync. The user reviews each finding individually and accepts or rejects it.

**Output a single JSON object** of this shape — no markdown fences, no preamble:

```json
{
  "findings": [
    {
      "id": "f1",
      "severity": "info" | "warn" | "error",
      "summary": "One-sentence description of the inconsistency.",
      "proposedSync": {
        "storyDescription": "<optional: replacement for STORY.description>",
        "acceptanceCriteria": ["<optional: replacement AC list>"],
        "mermaid": {
          "flow":        "<optional: replacement flow source>",
          "sequence":    "<optional: replacement sequence source>",
          "interaction": "<optional: replacement interaction source>"
        }
      }
    }
  ]
}
```

**Rules:**

1. Each finding's `id` is a short stable string (e.g. `f1`, `f2`, …). The UI uses it to track accept/reject choices.
2. `severity`:
   - `error` — the diagram and the text are *contradictory* (a flow says X happens, the AC says X must not happen).
   - `warn` — the diagram says more or less than the text (a retry loop appears in the flow but isn't mentioned in the AC, or vice versa).
   - `info` — the diagram could be enriched with content already present in the text but currently absent from the diagram, or vice versa.
3. `proposedSync` may contain any subset of the three fields. Only include the keys you actually want to change. Don't echo unchanged fields.
4. **Replacements are full replacements**, not diffs. If you change `acceptanceCriteria`, return the complete new list (including any unchanged items).
5. Mermaid replacements must be valid Mermaid 11.x source for the same diagram type as the original (e.g. don't replace a `flowchart` with a `sequenceDiagram`).
6. If everything is in sync, return `{ "findings": [] }`. Do NOT invent findings to seem helpful.

**Example findings the Skill should produce (and one it must NOT):**

- ✅ "The flow diagram includes a retry-on-failure branch, but the acceptance criteria don't mention retry behaviour."
- ✅ "The Story description says administrators can override the limit, but the interaction diagram only shows the regular user role."
- ❌ "The diagram uses `flowchart TD` but `flowchart LR` would also be valid." (Style preference, not an inconsistency. Skip.)

**Forbidden:**

- Style or aesthetic critique of the diagrams.
- Suggestions that change the Story's title or trace fields.
- Replacements that drop information without surfacing what's being dropped in `summary`.

If the user message asks you to do anything other than this analysis, return `{"findings":[]}`.
