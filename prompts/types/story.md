## Agent Plan: Fintech Jira Story Generation

### Phase 1: Business & Scope Mapping

* **Domain Context (for your reference only — do NOT mention in output):** This is a fintech investing platform with a server-side stack and a mobile app. Identify the asset type involved (Stock, ETF, ETP) and the transaction type (Buy, Sell, Limit Order, etc.).
* **Single discipline only:** The input is already scoped to ONE team's deliverable by the upstream planning step. Do NOT split the output into multiple tickets, and do NOT label the work by team.
* **Audience inference:** Read the input and identify what kind of work it describes — visual/interaction, server/data, design, or QA — so you can use the right vocabulary (see the Team-implicit framing rule below).

### Phase 2: Structural Drafting (Field by Field)

* **Summary & Release Notes:**
* **Summary:** Draft a sentence-case summary (5–6 words max).
* **Release Note Title:** Create a 2–3 word generic summary.
* **Release Note Description:** Write one non-technical sentence for the end-user.


* **Detailed Description:**
* If the work is interaction-focused: write about the screens, flows, states, and user-visible behavior the deliverable produces. Cover error states and edge cases the user can reach.
* If the work is data-focused: write about the contracts (request and response shapes), the validation rules, the persistence implications, and the failure modes (timeouts, retries, idempotency).
* **Interaction logic:** State the contract precisely — payload shape, status codes, error codes — without naming which side produces or consumes it.



### Phase 3: The "Plain Text" ADF Audit

* **Crucial Formatting Filter:** Before finalizing, strip all Markdown from the *content* of the sections.
* **ALLOWED:** `**Label:**` (for parsing), Numbered lists (1. 2. 3.), and indented dashes (-).
* **FORBIDDEN:** Asterisks for bold/italic inside descriptions, hash symbols (#) for headers, and horizontal dividers (---).


* **Language Check:** Ensure all text is professional, actionable, and free of "Lorem Ipsum" or placeholders.

### Phase 4: Acceptance Criteria & Integration

* **Numbered List Logic:** Convert requirements into a strict numbered list.
* **Verification Points:** Ensure ACs cover "Happy Path," "Edge Cases" (e.g., market closed, insufficient funds), and the cross-team handshake (i.e., what the deliverable expects from upstream and provides to downstream — phrased without naming who's upstream or downstream).
* **Single ticket only:** Produce exactly ONE ticket — splits happen earlier, at the planning stage. Do NOT emit any separator like "=== NEXT TICKET ===" — the input is already scoped to one team's deliverable.

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
* The output must have exactly these sections in order: **Summary:**, **Release note title:**, **Release note description:**, **Description:** (with a **Tasks:** sub-section using numbered items with - sub-bullets), **Acceptance criteria:** (numbered).

---

### Execution Checklist (Fintech Standard)

* [ ] Is the ticket scoped to a single discipline's deliverable (no mixed responsibilities)?
* [ ] Is the discipline obvious from vocabulary alone — without naming a team or technology?
* [ ] Are dependencies described as contracts ("the response will include…", "the screen will receive…") rather than handoffs by team name?
* [ ] **ADF Check:** Is the content purely plain text (no markdown)?
* [ ] Are the Release Notes understandable by a non-trader?
* [ ] Is the summary exactly 5–6 words?