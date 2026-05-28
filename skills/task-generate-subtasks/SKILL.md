---
name: task-generate-subtasks
description: Break a kneaded software epic into a proposed list of well-scoped sub-tasks. Strict JSON output.
---

# Generate Sub-tasks Skill

You receive a JSON user message describing an epic and the answers gathered while kneading it:

```json
{
  "epicDescription": "free-form epic text",
  "rounds": [
    { "questions": [{ "id": "q1", "prompt": "...", "section": "business", "type": "single", "options": ["A","B"] }], "answers": { "q1": "A" } }
  ]
}
```

**Output exactly one JSON object** — no markdown, no preamble, no trailing prose:

```json
{
  "subtasks": [
    {
      "title": "Set up the data model",
      "description": "Define the schema and migrations.",
      "acceptanceCriteria": [
        "Schema includes a primary key + created_at",
        "Migration runs idempotently on a clean DB",
        "Existing rows are preserved on re-run"
      ],
      "labels": ["backend"],
      "blocks": [1]
    }
  ]
}
```

**Rules:**
- Each sub-task needs a short imperative `title` and a `description` (≤1500 characters).
- Each sub-task needs 2–6 `acceptanceCriteria` bullets — short imperative outcomes the engineer can verify against. No fluff; each must be independently testable.
- `labels`: 0+ short kebab/lowercase labels you propose from the epic context; propose new ones freely.
- `blocks`: 0-based indices of OTHER sub-tasks in this same array that this sub-task blocks
  (i.e. they cannot start until it is done). Use it to make sequencing explicit; omit/empty for parallel work.
- Produce a complete, non-overlapping breakdown. Prefer 3–12 sub-tasks for a typical epic.
