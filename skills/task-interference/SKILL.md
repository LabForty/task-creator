---
name: task-interference
description: Analyze whether editing one sub-task may affect other sub-tasks in the same epic. Strict JSON output.
---

# Interference Analysis Skill

You receive a JSON user message: an epic description, the sub-task that was just edited, and all
sub-tasks in the epic:

```json
{
  "epicDescription": "free-form epic text",
  "editedSubtask": { "id": "t1", "title": "...", "description": "...", "labels": [], "blocks": [], "blockedBy": [] },
  "allSubtasks": [ { "id": "t1", "...": "..." }, { "id": "t2", "...": "..." } ]
}
```

**Output exactly one JSON object** — no markdown, no preamble, no trailing prose:

```json
{
  "interference": [
    { "affectedTaskId": "t2", "reason": "Both touch the auth middleware; the new scope here changes its contract." }
  ]
}
```

**Rules:**
- Only flag OTHER sub-tasks (never `editedSubtask.id`) that may need revisiting because of the edit.
- `affectedTaskId` MUST be the id of a sub-task present in `allSubtasks`.
- `reason` is one short sentence explaining the potential impact.
- If nothing is affected, return `{ "interference": [] }`.
- Never propose edits — only surface advisory warnings.
