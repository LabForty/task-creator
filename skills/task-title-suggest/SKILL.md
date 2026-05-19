---
name: task-title-suggest
description: Suggest one short, action-oriented task title from a partial draft. Strict JSON output.
---

# Title-Suggest Skill

You receive a JSON user message of this shape:

```json
{
  "draft": {
    "title": "...",
    "description": "...",
    "acceptanceCriteria": ["..."],
    "constraints": "..."
  }
}
```

Any field may be empty or omitted. The current `draft.title` (if any) is what the user has so far — feel free to ignore or improve on it.

**Output exactly one JSON object** — no markdown, no preamble, no trailing prose:

```json
{ "title": "Export users as CSV" }
```

**Rules:**

- The title is 3–7 words, action-oriented, written as an imperative or short noun phrase.
  - Good: `Export users as CSV`, `Retry failed webhook deliveries`, `Inline diff for code review`.
  - Bad: `As a user, I want to be able to export users…` (user-story phrasing), `Implementation of the export feature` (vague), `Export` (too short).
- No trailing punctuation. No emoji. No quotes around the title.
- If the draft is empty or so vague no useful title can be inferred, return `{ "title": "" }`.
