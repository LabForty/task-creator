## Agent Plan: High-Precision Jira EPIC Generation

### Phase 1: Context & Perspective Mapping

* **Role Selection:** Determine if the "As a..." should be the **User** (for external value) or **Admin/Ops/Compliance** (for internal efficiency).
* **The Jargon Scrub:** Scan the input for forbidden technical terms.
* *Replace:* "Outreach" → "Contacting"
* *Replace:* "Overlay" → "Pop-up"
* *Replace:* "Render" → "Show/Display"
* *Replace:* "Orchestration" → "Management/Handling"


* **Value Definition:** Identify the core "Why" to ensure the problem statement is grounded in reality.

### Phase 2: Narrative Drafting

* **Summary:** Create a short, **bold**, searchable title (e.g., **User Identity Verification Flow**).
* **Description:** Strictly follow the 3-line format:
* As a...
* I want...
* So that...


* **Problem Statement:** Write a concise **bold label** followed by the "pain point" in plain English. Avoid all design commentary.

### Phase 3: Technical Logic & Sequential Requirements

* **Sequence First:** If steps must happen in order (e.g., Step A before Step B), organize the requirements chronologically.
* **Requirement Structure (The "No Gap" Rule):** * Use a numbered list for main requirements.
* Immediately follow each number with bullet points for details.
* **Crucial:** Ensure there is **zero blank space** between the numbered items to keep the Jira ticket compact and readable.


* **Edge Case Inclusion:** Every requirement must address the "Happy Path" and at least one "Edge Case" (e.g., what happens if a link expires or a user enters wrong data).

### Phase 4: Acceptance Criteria & Simple English Audit

* **AC Conversion:** Transform requirements into short, dash-bullet items. Each one must be a concrete, binary (Yes/No) statement.
* **The Binary Test:** If it takes more than one breath to read, it's too long.
* **Coverage:** There should be one AC per key behavior from the Requirements — every requirement must map to at least one AC.
* **Final Verification:** * [ ] Is the summary clear and searchable?
* [ ] Are there any blank lines in the requirements? (Remove them if found).
* [ ] Is the language simple enough for a non-tech stakeholder?

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
* Epic tickets do NOT include release note fields.

---

### The "Golden Template" (For Exact Output)

**Summary:** [Short searchable title, e.g. Email verification (user flow + admin status)]

**Description:**

**As an** [User/Admin] at FlexInvest

**I want** [action or capability]

**So that** [business value or user outcome]

**Problem statement:**
[1-2 sentences in simple English explaining the gap or pain point]

**Requirements:**
1. [Requirement name]
   - [Detail or happy path behavior]
   - [Detail or edge case behavior]
2. [Next requirement name]
   - [Detail]
   - [Detail covering success and failure states]
3. [Next requirement name]
   - [Detail]
   - [Detail]

**Acceptance criteria:**
- [Simple Yes/No condition derived from requirement 1]
- [Simple Yes/No condition derived from requirement 2]
- [Simple Yes/No condition derived from requirement 3]
- [One condition per key behavior — cover all requirements]