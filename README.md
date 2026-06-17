# Task Creator

A standalone + embeddable webapp that turns a vague feature idea into a **Jira-ready user story** with diagrams. It drives two self-hosted Claude role prompts (`analyst` → `planner`) through the Claude Agent SDK, then layers four webapp-owned Claude Skills on top for diagrams, analysis, help, and title suggestion. The output follows industry-standard agile conventions:

- **User Story** in the classic *"As a … I want … so that …"* form
- **Acceptance Criteria** as **Gherkin** scenarios (`Given` / `When` / `Then`)
- **Definition of Done** checklist
- Adheres to **INVEST** when sizing stories

End users see a clean draft → markdown + interactive diagrams flow. No proprietary schemas or vocabulary in the output.

## What you can do

1. **Write a draft on a single screen** — Title, Description, Acceptance Criteria, and "Pay attention to" fields in a 2-column layout that fits a typical laptop viewport without scrolling. localStorage autosave + dirty warnings on tab close.
2. **Suggest a title with AI** — Suggest button next to the Title field reads the current description + AC + notes and proposes a short, action-oriented title.
3. **Help (Editor)** — conversational Claude Skill scans the draft, surfaces 3–6 actionable gaps as cards (missing info / edge case / alt flow). Clicking **Discuss** on a card flashes the matching form field so the user knows where their answer is going.
4. **Finalize task** — runs the **analyst** role (→ Requirement analysis), then the **planner** role (→ User Story with Gherkin AC + Definition of Done). Validates each step against a Zod schema, retries once on validation failure, runs an in-process consistency gate, and renders Jira-ready markdown.
5. **Editable markdown output** — the finalized markdown is a textarea, not a read-only block. Edits persist locally and are reflected in the .md download.
6. **Create diagrams** — generates **Flow**, **Sequence**, and **Interaction** Mermaid diagrams (AI-authored, not template-stamped).
7. **Edit diagrams interactively**
   - **Flow** uses a [react-flow](https://reactflow.dev) graph editor: click to rename, drag to move, drag from node handles to connect, change node shape and edge style, swap direction (TD / LR / BT / RL), relayout. The Mermaid source is updated automatically on every change. A **Source** toggle is always available for raw editing.
   - **Sequence** and **Interaction** render full-width with a small **Edit source** toggle for power users.
8. **Help (Diagram surface)** — same Skill, now aware of the current Mermaid sources too.
9. **Analyze diagrams** — Claude Skill compares text vs. diagrams, surfaces inconsistencies with proposed sync deltas. Accept/reject per finding + Apply N.
10. **Download** the finalized markdown.
11. **Export to Jira** — push the finalized task into Jira Cloud as a real issue. OAuth-based, with a per-export project + issue-type picker, and Mermaid sources attached as `.mmd` files. See "Jira Cloud integration" below.

## Prerequisites

- **Node.js ≥ 20** (Next 16 requirement).
- **A Claude credential** for real runs — either:
  - `CLAUDE_CODE_OAUTH_TOKEN` (subscription-backed, obtained via `claude setup-token`) — for the subscription holder's own use only; see Anthropic policy in `docs/plan/ops.md`. **OR**
  - `ANTHROPIC_API_KEY` (per-token billing — required for any external/third-party deployment).
- **PowerShell** if you're on Windows. Bash/zsh work fine too.

For poking around the UI without burning Claude tokens, set `TASK_AGENT_MODE=stub` and the AI calls become hand-authored stub responses.

## Quick start

```powershell
# 1. Install
npm install

# 2a. Real Claude
claude setup-token             # one-time, ~1 year token
$env:CLAUDE_CODE_OAUTH_TOKEN = "<paste>"

# 2b. ...or stub mode
$env:TASK_AGENT_MODE = "stub"
$env:CLAUDE_CODE_OAUTH_TOKEN = "stub"

# 3. Production build + run (recommended over `dev` on Windows)
npm run build
npm run start
# → http://127.0.0.1:3000          standalone
# → http://127.0.0.1:3000/embed?returnOrigin=http://host    iframe-friendly

# 4. End-to-end demo (no UI, prints Requirement + Story + markdown to stdout)
npm run finalize:demo
```

## Mac Studio production hosting

For a simple always-on Mac Studio deployment, copy the repo to the Mac, create an ignored
`.env.production.local` (or `.env`) with the production secrets, then run:

```bash
npm run prod
```

`npm run prod` is macOS-only. It runs `npm ci`, builds the Next.js production bundle,
writes a user `launchd` service, starts it, and polls `/api/health` before returning.
The service keeps running after the SSH session exits and is restarted by `launchd` if
the process crashes.

Useful commands:

| Script | What |
|---|---|
| `npm run prod` | Install, build, register/start the `launchd` service, and health-check it |
| `npm run prod -- --skip-install` | Rebuild/reload without reinstalling dependencies |
| `npm run prod -- --skip-build` | Reload an already-built checkout |
| `npm run prod:status` | Print `launchd` status for the service |
| `npm run prod:logs` | Tail production stdout/stderr logs |
| `npm run prod:restart` | Restart the running service and health-check it |
| `npm run prod:stop` | Stop and unload the service |

By default the service binds Next to `127.0.0.1:3000`. Override with
`TASK_CREATOR_HOST` / `TASK_CREATOR_PORT` when running `npm run prod`, then put Caddy,
nginx, or another reverse proxy in front for HTTPS. For HTTPS deployments, set
`JIRA_REDIRECT_URI` to the public callback URL and `JIRA_SECURE_COOKIE=true`.

The production runner intentionally does **not** copy secret shell variables into the
`launchd` plist. Put required secrets in `.env.production.local` or `.env` so `next start`
can load them after SSH exits.

## Architecture at a glance

Next.js App Router monolith. **Six** AI interactions, each implemented as a Skill / role markdown file driven through the Claude Agent SDK:

| Surface | Where it lives | What it does |
|---|---|---|
| Finalize task → `analyst` | `prompts/analyst.md` | Returns a JSON Requirement analysis (summary, problem, value, AC, out-of-scope, dependencies, risks). |
| Finalize task → `planner` | `prompts/planner.md` | Returns a JSON User Story (As-a/I-want/So-that, description, Gherkin AC, Definition of Done). |
| Create diagrams | `skills/task-create-diagrams/SKILL.md` | Returns `{flow, sequence, interaction}` Mermaid sources as JSON. |
| Analyze diagrams | `skills/task-analyze-diagrams/SKILL.md` | Returns findings + proposed sync deltas as JSON. |
| Help (editor or diagrams) | `skills/task-help/SKILL.md` | Returns a chat reply + optional cards with `fieldHint`. |
| Title suggest | `skills/task-title-suggest/SKILL.md` | Returns `{title}` for the Suggest button. |

The whole AI surface is encapsulated in `lib/agent/index.ts` — every other module (API routes, components, orchestrator) never touches the Claude SDK directly. The transport is swappable: real SDK vs. stub picked by `TASK_AGENT_MODE`.

```
task-creator/
├─ app/                       Next.js App Router (UI + API routes)
│  ├─ page.tsx                standalone page (editor / preview / help)
│  ├─ embed/page.tsx          iframe-friendly embed page
│  └─ api/                    /finalize, /diagrams/{create,analyze}, /help,
│                             /title/suggest, /jobs/[id], /jobs/[id]/stream,
│                             /jobs/[id]/download/[artifact]
├─ components/                React components
│  ├─ Editor.tsx              single-screen draft form
│  ├─ Preview.tsx             editable markdown + diagram side-by-side
│  ├─ DiagramView.tsx         format switcher (flow/sequence/interaction)
│  ├─ FlowGraphEditor.tsx     react-flow graphical editor for flow diagrams
│  ├─ DiagramEditor.tsx       text+preview editor for sequence/interaction
│  ├─ HelpPanel.tsx           chat panel with field-flash on Discuss
│  ├─ AnalyzePanel.tsx        accept/reject findings UI
│  └─ ui/                     Button, TextField, SegmentedControl
├─ lib/
│  ├─ agent/                  ★ ONLY module that imports the Claude SDK
│  ├─ api/                    zod schemas for the HTTP contract
│  ├─ pipeline/               in-process pipeline: zod-validated Requirement + Story types
│  ├─ draft/                  localStorage autosave (Draft + chatHistory + diagrams)
│  ├─ finalize/               orchestrator (analyst → schema gate → planner → schema gate → consistency → render)
│  ├─ jobs/                   in-memory job store + typed JobEvent bus
│  ├─ mermaid-flow/           parse / serialize / layout Mermaid flowchart syntax
│  ├─ render/                 Story → Jira-ready markdown
│  └─ sse/                    browser EventSource wrapper
├─ middleware.ts              CORS allowlist for /api/*
├─ prompts/
│  ├─ analyst.md              role prompt — produces a structured requirement analysis (JSON)
│  └─ planner.md              role prompt — produces a Jira-ready user story (JSON)
├─ scripts/
│  └─ run-once.ts             end-to-end demo (npm run finalize:demo)
├─ skills/                    webapp-owned Claude Skills
│  ├─ task-create-diagrams/
│  ├─ task-analyze-diagrams/
│  ├─ task-help/
│  └─ task-title-suggest/
├─ tests/                     vitest unit + integration
└─ e2e/                       Playwright smoke
```

## Design system

The UI follows a shared, HIG-based token system (colours, type ramp, spacing,
shadows) defined in `tailwind.config.ts` + `app/globals.css`. See the design
pattern guide at **[`docs/design-system.md`](docs/design-system.md)** for tokens,
conventions, and a getting-started section, and the live reference at
**`/styleguide`** (run `npm run dev`, open `/styleguide`). Run `npm run check:tokens`
to verify no raw hex or arbitrary values have crept in.

## Scripts

| Script | What |
|---|---|
| `npm run dev` | Next dev server at `:3000` (prefer `build` + `start` on Windows) |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run prod` | Mac Studio/macOS production install + `launchd` start + health check |
| `npm run prod:status` | Show the loaded `launchd` service state |
| `npm run prod:logs` | Tail production service logs |
| `npm run prod:restart` | Restart the `launchd` service |
| `npm run prod:stop` | Stop and unload the `launchd` service |
| `npm run test` | Vitest unit + integration |
| `npm run test:e2e` | Playwright smoke (uses `TASK_AGENT_MODE=stub`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint flat config |
| `npm run finalize:demo` | End-to-end demo run against real Claude (requires token) |

## Configuration

| Var | Required? | Notes |
|---|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | yes for real runs (subscription) | Subscription auth (`claude setup-token`). Own-use only. |
| `ANTHROPIC_API_KEY` | alt | Use instead for any external deployment. |
| `TASK_EMBED_ORIGINS` | optional | Comma-separated origin allowlist for `/api/*`. Empty → any origin (dev). |
| `TASK_AGENT_MODE` | optional | `stub` swaps every Claude call for a deterministic stub. |
| `JIRA_CLIENT_ID` | optional | OAuth 2.0 (3LO) client id from `developer.atlassian.com`. Required to enable the Jira export. |
| `JIRA_CLIENT_SECRET` | optional | Matching client secret. |
| `JIRA_COOKIE_SECRET` | optional | ≥32 random characters; used as AES-256-GCM key for the session cookie. |
| `JIRA_REDIRECT_URI` | optional | Defaults to `http://127.0.0.1:3000/api/jira/callback`. Must match the value registered on the OAuth app. |

## Jira Cloud integration

Standalone-only. Finalize a task, then push it into Jira Cloud as a real issue with the title,
user story, description, Gherkin acceptance criteria, and Definition of Done. If diagrams are
present, each Mermaid source is attached to the issue as a `.mmd` file.

### One-time setup

1. Open <https://developer.atlassian.com/console/myapps/> and create an **OAuth 2.0 (3LO)**
   integration.
2. Under **Permissions**, add the **Jira API** and grant scopes:
   `read:jira-work`, `write:jira-work`, `read:jira-user`, `offline_access`.
3. Under **Authorization**, set the callback URL to
   `http://127.0.0.1:3000/api/jira/callback` (or whatever you put in `JIRA_REDIRECT_URI`).
4. Copy the client id and secret into env, plus a strong cookie secret:

```powershell
$env:JIRA_CLIENT_ID = "<your client id>"
$env:JIRA_CLIENT_SECRET = "<your client secret>"
$env:JIRA_COOKIE_SECRET = "<32+ random chars>"
```

5. Start the app (`npm run build && npm run start`) and click **Connect to Jira** in the
   header. Atlassian will ask you to consent and pick a site; you'll land back on the app
   with the chip showing your email.

### Exporting

After **Finalize task**, click **Export to Jira** on the Preview screen. Pick a project and
issue type (Task or Story is auto-selected if available). The right pane shows exactly what
Jira will receive. Click **Create issue**. You'll get back the issue key and an open-in-Jira
link.

### Notes

- The browser stores nothing — auth lives in an httpOnly cookie. Click **Disconnect** in the
  chip menu to clear it.
- Access tokens are short-lived; the server refreshes silently with the rotating refresh
  token. If a refresh fails (e.g. you revoked access from Atlassian), the UI shows
  "Reconnect to Jira."
- Attachment uploads are best-effort: if one fails, the issue is still created and the UI
  flags which formats didn't upload.
- The `/embed` page does **not** include Jira UI — embed in an iframe is an explicit
  non-goal for v1.

## Where things live

| Want to | Look in |
|---|---|
| Add a Claude Skill | `skills/<name>/SKILL.md` + new function in `lib/agent/index.ts` + new route under `app/api/` |
| Change the markdown rollup | `lib/render/index.ts` |
| Change a role prompt (analyst / planner) | `prompts/<role>.md` |
| Change the API contract | `lib/api/schemas.ts` + the matching `app/api/.../route.ts` |
| Change the Requirement / Story Zod schemas | `lib/pipeline/types.ts` |
| Tweak the flow editor | `components/FlowGraphEditor.tsx` + `lib/mermaid-flow/{parse,serialize,layout}.ts` |
| Understand or extend the design system | `docs/design-system.md` + `/styleguide` |
