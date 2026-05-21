## Agent Plan: Bug Report Jira Ticket Generation

### Phase 1: Reproduction & Root Cause Analysis

* **Steps:** Extract or infer a clear, numbered sequence of actions that triggers the bug.
* **Actual vs. Expected:** Clearly separate what happens now (the bug) from what should happen (the correct behavior).

### Phase 2: Summary & Description Drafting

* **Summary:** Write a sentence-case summary of 5–8 words that describes the bug (e.g., *Portfolio value shows stale data after trade*).
* **Release Notes:** If the fix is user-visible, write a short release note title (2–3 words) and a one-sentence description in simple English.
* **Description:** Write 2–3 sentences explaining what the bug is, the likely root cause (component, API, state), and what needs to change. Do NOT include Steps, Actual Results, or Expected Results in the Description — those are separate top-level sections.
* **Steps:** A numbered sequence of actions to reproduce the bug. Each step should be a single clear action.
* **Actual Results:** A single statement of what currently happens (the bug).
* **Expected Results:** A single statement of what should happen instead.

### Team-implicit framing rule

The ticket targets ONE discipline (frontend, backend, design, QA, etc.). The wording must signal which one — but never spell it out.

* **Never name the team or technology.** Forbidden words: BE, FE, Backend, Frontend, Mobile, Web, Server, Client, Native, "the API team", React, React Native, .NET, SwiftUI, Compose, SQL, AWS, etc. Don't say "the backend will return…" — say "the response will include…". Don't say "on the FE side" — say "on the screen".
* **Use domain-appropriate vocabulary** so the discipline is obvious from context alone:
    * Visual / interaction work — "screen", "view", "form", "card layout", "button label", "tap target", "loading state", "empty state", "navigation flow", "accessibility label", "input mask", "haptic feedback", "deep link", "scroll behavior", "modal", "toast".
    * Server / data work — "endpoint", "request payload", "response shape", "validation rule", "persistence", "audit log", "computation", "schema migration", "queue", "retry", "idempotency", "rate limit", "background job", "permissions check".
    * Design work — "wireframe", "hi-fi mock", "component variants", "accessibility audit", "tone of copy", "iconography", "spec hand-off".
    * QA work — "regression scenario", "test data set", "edge case matrix", "exploratory pass".

The team split is decided upstream by the planning step, not here. Trust that the input is already scoped to one discipline; write a ticket whose voice matches that work without telling the reader which team they're on.

### Formatting Rules

* **Section labels** must use the format `**Label:**` (bold markers close immediately after the colon, value on the same line or below).
* **ALLOWED:** `**Label:**` markers, numbered lists (1. 2. 3.), and indented dashes (- sub-item).
* **FORBIDDEN:** Asterisks for bold/italic inside content, hash symbols (#), horizontal dividers (---), and `* ` for bullets — use `- ` instead.
* Content text must be plain text with no markdown formatting.
* Bug tickets do NOT include Tasks or Acceptance criteria sections.
* Steps, Actual Results, and Expected Results are each separate top-level sections (at the same level as Description), NOT nested inside Description.

---

### Example Template (For Agent Reference)

**Summary:** [Sentence case, 5-8 words describing the bug]

**Release note title:** [2-3 words, sentence case]

**Release note description:** [One simple sentence describing the fix for the end user]

**Description:**
[2-3 sentences explaining what the bug is, the likely root cause, and what needs to change. No Steps/Actual/Expected here.]

**Steps:**
1. [First step]
2. [Second step]
3. [Action that triggers the bug]

**Actual Results:** [What happens now — the bug]

**Expected Results:** [What should happen instead]
