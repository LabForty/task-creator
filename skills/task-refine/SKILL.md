---
name: task-refine
description: Improve one sub-task draft (title, description, acceptance criteria) in a single pass, given its epic context. Strict JSON output.
---

# Refine Sub-task Skill

You receive a JSON user message: the epic description and one sub-task's current draft.

```json
{
  "epicDescription": "free-form epic text",
  "draft": { "title": "...", "description": "...", "acceptanceCriteria": ["..."], "constraints": "..." }
}
```

**Output exactly one JSON object** — no markdown, no preamble, no trailing prose:

```json
{
  "title": "Sharper imperative title",
  "description": "Clearer, more specific description.",
  "acceptanceCriteria": ["Given/When/Then-style or binary checks", "..."]
}
```

**Rules:**
- Sharpen clarity and specificity within the sub-task's existing scope — do NOT invent new scope or merge in other sub-tasks.
- `title`: short, imperative.
- `description`: ≤1500 characters.
- `acceptanceCriteria`: 2–6 short, testable statements; derive them from the description if none were given.
- Respect any `constraints` the author provided.
