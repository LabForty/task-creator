## Agent Plan: Precision Jira Ticket Generation

### Phase 1: Classification & Scoping

* **Identify the Stream:** Determine if the task is **visual design work** (creating/updating wireframes, hi-fi mocks, component variants) or **interaction implementation** (building screens, wiring states, fixing visual bugs). Phrase the rest of the ticket accordingly — see the Team-implicit framing rule below.
* **Context Gathering:** Identify the specific screen, component, or contract involved.
* **Impact Assessment:** Define *why* this matters. Is it fixing a broken user flow, improving business metrics, or maintaining consistency?

### Phase 2: Drafting the Narrative (Title & Description)

* **Title Construction:** Use the format `[Action/Type]: [Specific Area]`. Keep it under 10 words.
* **The "Why" Statement:** Write 2–3 sentences in the Description explaining the problem and the business/user value.
* **Eliminate Ambiguity:** Avoid words like "improve," "optimize," or "make better" without defining the specific metric or behavior change.

### Phase 3: Task Logic & Requirements

* **For visual design tickets:**
* List specific components to reuse from the design system.
* Define **Content Logic**: Use realistic data (strictly no "Lorem Ipsum").
* Apply **Text Rules**: Ensure sentence case and no repetition.
* Define **State Coverage**: Write tasks for Loading, Empty, and Error states.


* **For interaction-implementation / bug tickets:**
* Document "Current vs. Expected" behavior.
* List the "Steps to Reproduce."
* Identify connected contracts or shared hooks that may be affected.


* **Sequencing:** Order tasks logically (e.g., "Investigate X" before "Implement Y").

### Phase 4: Acceptance Criteria (AC) & Final Polish

* **The "Independent Test":** Write ACs as verifiable outcomes. If a tester cannot answer "Yes/No" to the AC, rewrite it.
* **Technical Guardrails:** Include a "Notes" section to reinforce component patterns and hook usage.
* **Linkage:** Remind the user to attach or link to Figma frames, documentation, or relevant code repositories.

---

### Execution Checklist (The "Independent Execution" Audit)

* [ ] Does the Title explain exactly what is being touched?
* [ ] Are all 3 states (Loading, Empty, Error) addressed?
* [ ] Is there any "Lorem Ipsum" or vague placeholder text? (If yes, replace with realistic data).
* [ ] Are the steps to reproduce clear enough for a new hire to follow?
* [ ] Is there any design commentary that should be a task instead?

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
* Design tickets do NOT include release note fields.

---

### Example Template (For Agent Reference)

**Summary:** [Action/Type]: [Specific Area, 5-10 words max]

**Description:**
[2-3 sentences explaining the problem and the business/user value. No filler phrases.]

**Tasks:**
1. [First task — e.g., Review current component and identify gaps]
   - [Sub-task detail]
   - [State coverage: Loading, Empty, Error]
2. [Second task — e.g., Create/update design in Figma]
   - [Sub-task detail]
3. [Third task — e.g., Define interaction and animation specs]
4. [Fourth task — e.g., Spec hand-off with annotated screens]

**Acceptance criteria:**
1. [Verifiable outcome — Yes/No testable]
2. [Verifiable outcome]
3. Loading, Empty, and Error states are addressed
4. No placeholder or Lorem Ipsum text in any design