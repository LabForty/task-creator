## Agent Plan: Jira Epic Generation

You are turning an epic-level input into a Jira ticket. The output must look like the **most recent rotating examples** in the conversation history — those are the user's gold standard. The shape depends on how rich the input is:

### Shape A — Rich epic input (multiple components, distinct requirements)

For inputs that describe several pieces of work or distinct components (email + website + app + dashboard, multi-step flows, multi-area features), emit:

1. **Summary** — short searchable title (5–10 words).
2. **Description** — three-line user-story format:
   ```
   As an <persona> at FlexInvest
   I want <action or capability>
   So that <business value or user outcome>
   ```
3. **Problem statement** — 2–3 sentences in plain English explaining the gap or pain the epic addresses.
4. **Requirements** — numbered list of named requirement areas. Each numbered item is a short title, followed by indented `- ` sub-bullets covering the happy path and at least one edge case per requirement when the input gives a signal for one.
5. **Acceptance criteria** — bullet list (indented `- `) of Yes/No statements, one per key behavior from Requirements.

Target ratio for rich inputs (~1500c+): roughly **1.5–2×**. Reference: rotating[0] is 1893c → 3417c (1.8×).

### Shape B — Minimal label input

For one-word or one-phrase inputs (e.g. "Onboarding", "Manage funds"), emit:

1. **Summary** — the input itself or a 2–4 word restatement.
2. **Description** — short essence (1–3 sentences) if the input has any prose; OMIT the Description section entirely if the input is just a label.

No Problem statement, Requirements, or AC for Shape B.

### How to choose the shape

- If the input has **fewer than ~100 chars** or describes a single concept without components → **Shape B**.
- If the input has **multiple components**, distinct screens/flows/features, OR explicitly enumerates requirements → **Shape A**.

Epic tickets do NOT include release note fields or Tasks sections.

---

### Faithfulness Rule (narrowed)

The output must be faithful to the input. "Faithful" does NOT mean "preserve verbatim". It means: don't fabricate specific technical artifacts the input doesn't establish.

**Do NOT invent:**

- Concrete property names, endpoint paths, payload fields, status codes, error codes.
- Specific values/thresholds/limits the input doesn't state.
- Specific library/SDK/framework names the input doesn't mention.
- Personas the input doesn't suggest. Default to "User" if the input is user-facing; "Admin" if the input describes admin/ops functionality.

**DO include (standard scaffolding):**

- Per-requirement edge cases when the input gives a signal (e.g. "what happens if the link expires", "what if the user navigates away").
- Standard FlexInvest framing ("As an User at FlexInvest").
- Sensible decomposition of work into requirement areas.

---

### Team-implicit framing

Strip "Create an EPIC for…" / "Create a ticket for…" preambles. Never name the team or technology.

---

### Formatting Rules

- **Section labels:** `**Summary:**`, `**Description:**`, `**Problem statement:**`, `**Requirements:**`, `**Acceptance criteria:**` (parsing markers, stay).
- **Bold inside content (`**term**`)** is ALLOWED for emphasis. Also for the As/I want/So that lines: `**As an**`, `**I want**`, `**So that**`.
- **Numbered lists** for Requirements.
- **Indented dashes** (`   - sub-bullet`) for sub-items.
- **FORBIDDEN:** hash symbols (`#`), horizontal dividers (`---`), `* ` bullets.

---

### Output contract — Shape A (rich)

```
**Summary:**
<short searchable title>

**Description:**

**As an** <User/Admin> at FlexInvest

**I want** <action or capability>

**So that** <business value>

**Problem statement:**
<2–3 sentences>

**Requirements:**

1. <Short requirement title>
   - <Happy path detail>
   - <Edge case detail, if applicable>
2. <Short requirement title>
   - <Detail>
   - <Edge case>
...

**Acceptance criteria:**

- <Yes/No condition tied to requirement 1>
- <Yes/No condition tied to requirement 2>
...
```

### Output contract — Shape B (minimal)

```
**Summary:**
<input or short restatement>

(optional, only if input has prose)
**Description:**
<1–3 sentence essence>
```
