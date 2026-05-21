## Agent Plan: Spike Jira Ticket Generation

### Phase 1: Problem & Constraint Analysis

* **Identify the Core Friction:** Determine what is currently slow, breaking, or difficult to maintain.
* **Map the Guardrails:** Note the hard constraints (e.g., security/PII, i18n, specific integrations) that the research must respect.
* **Define the Scope:** Clarify if this is a platform-wide change or limited to a specific environment (DEV/STG/PROD).

### Phase 2: Summary & Description Drafting

* **Summary Creation:** Write a sentence-case summary of 5–6 words maximum (e.g., *Research state management for account switcher*).
* **Context Setting:** In the Description, summarize the pain points and current solution without using "filler" phrases like "This ticket is for...".
* **Avoid Implementer Bias:** Ensure the description focuses on the *need for a solution*, not the solution itself.

### Phase 3: Task Definition (Research & Deliverables)

* **Drafting the Tasks:** Use numbered items with indented dash sub-bullets for details. Focus on verbs like *Evaluate*, *Compare*, *Document*, and *Draft*.
* **Mandatory Research Elements:**
* Review current setup/pain points.
* Explore 2–3 specific approaches with Pros/Cons/Risks.
* Assess impact on testing and release cycles.


* **Output Identification:** Define the exact document, diagram, or POC (Proof of Concept) required to close the spike.

### Phase 4: Acceptance Criteria & Compliance Audit

* **The "Numbered List" Rule:** Format the Acceptance Criteria as a numbered list. **This must be the only numbered list in the ticket.**
* **Output Validation:** Ensure the ACs require tangible results (e.g., "1. Proposal document shared with the team") that allow for the creation of follow-up implementation stories.
* **Final Formatting Check:**
* [ ] No release note fields?
* [ ] Simple wording used throughout?
* [ ] Exactly four sections: Summary, Description, Tasks, Acceptance criteria?

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
* Spike tickets do NOT include release note fields.

---

### Example Template (For Agent Reference)

**Summary:** [Sentence case, 5-6 words max]

**Description:**
[Short explanation of the problem area and pain points. Include constraints like i18n or security here.]

**Tasks:**
1. Review current [Area] logic and identify main bottlenecks
   - [Specific sub-task or detail]
   - [What to look for or measure]
2. Research 2-3 alternative approaches
   - [Option A with brief description]
   - [Option B with brief description]
   - [Compare pros, cons, and risks for each]
3. Evaluate how each option affects automated testing and releases
   - [Impact on existing test suite]
   - [Impact on release cycle or deployment]
4. Select a recommended path with clear reasoning
   - [Document why this option was chosen]
5. Draft a proposal document and system diagram
   - [Include architecture diagram or flow]
   - [List follow-up implementation stories]

**Acceptance criteria:**
1. Document comparing 3 options with pros and cons is complete
2. Recommended approach is chosen and approved
3. Diagram of the proposed flow is attached
4. Follow-up dev stories are drafted based on the research results