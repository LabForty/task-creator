This agent plan is designed for **Change Requests (CR)**—specific tickets used when a stakeholder or client requests a modification to a feature that has already been defined, designed, or built. It focuses on the "Delta" (the difference between what exists and what is wanted) to prevent confusion.

---

## Agent Plan: Change Request (CR) Jira Generation

### Phase 1: Impact & Delta Mapping

* **Identify the Baseline:** Clearly state what the current behavior or design is.
* **Define the Change:** Pinpoint exactly what needs to be added, removed, or modified.
* **Simple English Filter:** Ensure terms like "refactoring" or "migration" are replaced with "updating" or "moving data."

### Phase 2: Narrative & Justification

* **Summary:** Create a 5–6 word sentence-case summary starting with "Change:" or "Update:" (e.g., *Change: Update withdrawal limit for silver users*).
* **The "Why":** Explain the driver (e.g., New regulation, user feedback, or business pivot).
* **Release Impact:** Determine if this requires a release note for the end user.

### Phase 3: Description & Task Breakdown

* **Current behavior:** Clearly describe what the system does today so the developer knows the starting point.
* **Requested change:** Describe exactly what needs to change — the delta between current and desired.
* **Tasks:** Break down the implementation into numbered steps with sub-bullets for details, so developers can follow step by step.

### Phase 4: Acceptance Criteria & Verification

* **Verification Points:** Ensure ACs are numbered and binary (Yes/No).
* **Regression Check:** Include an AC specifically to ensure existing functionality (that wasn't supposed to change) remains intact.
* **Formatting Check:** Ensure no markdown is used in the content fields (if following the Fintech/ADF rule) and no blank lines between numbered items.

---

### Execution Checklist (The CR Audit)

* [ ] Is the "Current Behavior" clearly described so the dev knows the starting point?
* [ ] Is the "Proposed Behavior" unambiguous?
* [ ] Does the ticket address what happens to "in-flight" data or users?
* [ ] Are the Release Notes (if needed) written in simple English?
* [ ] **ADF/Plain Text Check:** Are there any forbidden asterisks or hashes in the content?

---

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

---

### Example Template (For Agent Reference)

**Summary:** Change: [Description of change in 5 words]

**Release note title:** [2-3 words, sentence case]

**Release note description:** [Simple explanation of the update]

**Description:**
**Current behavior:** [Explain how it works today]
**Requested change:** [Explain the new requirement]

**Tasks:**
1. Update [Component/API] to reflect the new logic
   - [Detail or sub-task]
2. Modify [Data field/UI element]
   - [Detail or sub-task]
3. Ensure [Existing feature] is not affected
4. Update documentation/Figma to match the new state

**Acceptance criteria:**
1. User can successfully [New action]
2. Old logic is completely removed and no longer triggers
3. Error message [Specific text] appears when [Edge case]
4. Existing user data remains consistent after the update