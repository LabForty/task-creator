import { readFile } from "node:fs/promises";
import path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { JobEvent, RoleName, Diagrams, MermaidFormat } from "@/lib/jobs/types";
import {
  parseRequirement,
  parseStory,
  buildAnalystInput,
  buildPlannerInput,
  hasAcceptanceCriteriaSection,
  type Requirement,
  type Story,
  type DraftInput,
} from "@/lib/pipeline";
import type { Draft } from "@/lib/draft/autosave";
import { extractJsonObject } from "@/lib/json/extract";
import { parseKneadResponse, applyCap } from "@/lib/knead/parse";
import type { KneadOutcome, KneadRound } from "@/lib/knead/types";
import { FALLBACK_FIRST_ROUND } from "@/lib/knead/fallback";
import { parseSubtasksResponse } from "@/lib/subtasks/parse";
import type { ProposedSubtask } from "@/lib/subtasks/types";
import { parseRefineResponse, type RefineResult } from "@/lib/refine/parse";
import type { AgentEvent, AgentTransport, RunArgs } from "./types";

// Webapp-owned Claude Skills. Loaded from skills/<name>/SKILL.md at invocation
// time — never bundled, so prompt changes don't require rebuild.
const SKILLS_ROOT = path.resolve(process.cwd(), "skills");
const PROMPTS_ROOT = path.resolve(process.cwd(), "prompts");

async function loadSkillPrompt(skillName: string): Promise<string> {
  return readFile(path.join(SKILLS_ROOT, skillName, "SKILL.md"), "utf8");
}

async function loadRolePrompt(role: RoleName): Promise<string> {
  return readFile(path.join(PROMPTS_ROOT, `${role}.md`), "utf8");
}

// ---------------------------------------------------------------------------
// Generic helper: drive a Skill / role to a single JSON-object reply.
// ---------------------------------------------------------------------------

type RunSkillArgs = {
  role: string;
  systemPrompt: string;
  userMessage: string;
  transport: AgentTransport;
  onProgress?: (message: string) => void;
  onError?: (e: { code: string; message: string; retriable: boolean }) => void;
  signal?: AbortSignal;
};

async function runSkillToText(args: RunSkillArgs): Promise<string> {
  let buffer = "";
  let pending: Error | null = null;
  await args.transport.runRole({
    role: args.role,
    systemPrompt: args.systemPrompt,
    userMessage: args.userMessage,
    cwd: process.cwd(),
    signal: args.signal,
    onEvent: (e: AgentEvent) => {
      if (e.type === "token") buffer += e.text;
      else if (e.type === "progress") args.onProgress?.(e.message);
      else if (e.type === "error") {
        args.onError?.({ code: e.code, message: e.message, retriable: e.retriable });
        pending = new Error(`${e.code}: ${e.message}`);
      }
    },
  });
  if (pending) throw pending;
  return buffer;
}

function parseSkillJson<T>(buffer: string, skillName: string): T {
  const candidate = extractJsonObject(buffer);
  if (!candidate) {
    throw new Error(
      `${skillName}: model output was not valid JSON (no object found). First 200 chars: ${buffer.slice(0, 200)}`,
    );
  }
  try {
    return JSON.parse(candidate) as T;
  } catch {
    throw new Error(
      `${skillName}: model output was not valid JSON. First 200 chars: ${candidate.slice(0, 200)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Pipeline roles (analyst, planner). Both produce JSON in-memory now — no
// workspace, no file IO. The orchestrator validates with Zod and decides
// whether to retry.
// ---------------------------------------------------------------------------

export async function runAnalyst(
  args: RunArgs & { draft: DraftInput; retryHint?: string[] },
): Promise<{ requirement: Requirement }> {
  args.publish({ type: "role_started", role: "analyst" });

  const systemPrompt = await loadRolePrompt("analyst");
  const baseMessage = buildAnalystInput(args.draft);
  const userMessage = args.retryHint?.length
    ? buildRetryMessage("analyst", baseMessage, args.retryHint)
    : baseMessage;

  const buffer = await runSkillToText({
    role: "analyst",
    systemPrompt,
    userMessage,
    transport: args.transport,
    signal: args.signal,
    onProgress: (m) => args.publish({ type: "role_progress", role: "analyst", message: m }),
    onError: (e) => args.publish({ type: "error", ...e }),
  });

  // Tokens are streamed to the UI for live preview.
  args.publish({ type: "role_token", role: "analyst", token: buffer });

  const result = parseRequirement(buffer);
  if (!result.ok) {
    const err = new Error(`analyst: ${result.errors.join("; ")}`);
    (err as Error & { gateErrors?: string[] }).gateErrors = result.errors;
    throw err;
  }

  args.publish({ type: "role_finished", role: "analyst", artifactId: result.value.title });
  return { requirement: result.value };
}

export async function runPlanner(
  args: RunArgs & {
    requirement: Requirement;
    draft: DraftInput;
    retryHint?: string[];
    // The selected task-type template content (markdown prose describing
    // ticket structure). Injected into the planner system prompt so the
    // planner produces a body that follows the template.
    template?: { key: string; content: string };
  },
): Promise<{ story: Story }> {
  args.publish({ type: "role_started", role: "planner" });

  const basePlannerPrompt = await loadRolePrompt("planner");
  const systemPrompt = args.template
    ? buildPlannerSystemPrompt(basePlannerPrompt, args.template)
    : basePlannerPrompt;
  const baseMessage = buildPlannerInput(args.requirement, args.draft);
  const userMessage = args.retryHint?.length
    ? buildRetryMessage("planner", baseMessage, args.retryHint)
    : baseMessage;

  const buffer = await runSkillToText({
    role: "planner",
    systemPrompt,
    userMessage,
    transport: args.transport,
    signal: args.signal,
    onProgress: (m) => args.publish({ type: "role_progress", role: "planner", message: m }),
    onError: (e) => args.publish({ type: "error", ...e }),
  });

  args.publish({ type: "role_token", role: "planner", token: buffer });

  const result = parseStory(buffer);
  if (!result.ok) {
    const err = new Error(`planner: ${result.errors.join("; ")}`);
    (err as Error & { gateErrors?: string[] }).gateErrors = result.errors;
    throw err;
  }

  // Hard rule: every ticket must contain an Acceptance Criteria section,
  // regardless of which template was selected. We surface this as a schema-
  // gate failure so the existing retry path (in finalize/index.ts) kicks
  // in automatically with a targeted hint, instead of waiting for the
  // softer consistency gate.
  if (!hasAcceptanceCriteriaSection(result.value.markdown)) {
    const msg =
      "markdown is missing an Acceptance Criteria section. Add a section whose heading text contains \"Acceptance criteria\" (heading style like `## Acceptance criteria` OR bold-label style like `**Acceptance criteria:**`, matching the template's prevailing convention) with at least 2 short testable bullets.";
    const err = new Error(`planner: ${msg}`);
    (err as Error & { gateErrors?: string[] }).gateErrors = [msg];
    throw err;
  }

  args.publish({ type: "role_finished", role: "planner", artifactId: result.value.title });
  return { story: result.value };
}

// Compose the planner system prompt with the selected task-type template
// appended below. The base prompt (prompts/planner.md) defines the strict
// JSON output contract; the template defines how the markdown body inside
// it should be shaped.
function buildPlannerSystemPrompt(
  base: string,
  template: { key: string; content: string },
): string {
  return [
    base,
    "",
    "---",
    "",
    `## Selected task type: \`${template.key}\``,
    "",
    "Follow the template below when authoring the `markdown` field. Treat its",
    "structure, section names, tone, and formatting rules as authoritative.",
    "The template uses its own headings/sections — emit those exactly. Do NOT",
    "fall back to the generic story shape unless the template tells you to.",
    "",
    template.content.trim(),
  ].join("\n");
}

function buildRetryMessage(role: RoleName, baseMessage: string, errors: string[]): string {
  const bullets = errors.map((e) => `  - ${e}`).join("\n");
  return [
    `RETRY — the previous ${role} output failed validation.`,
    "",
    `Errors:`,
    bullets,
    "",
    `Re-emit the JSON object, correcting ONLY the fields above. Keep everything else identical.`,
    `Do not include preamble, fences, or trailing prose. One JSON object, nothing else.`,
    "",
    `Original input:`,
    baseMessage,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Webapp Skills — operate on in-memory artifacts, output JSON.
// ---------------------------------------------------------------------------

export async function runCreateDiagrams(args: {
  requirement: Requirement;
  story: Story;
  draft: Draft;
  formats?: MermaidFormat[];
  transport: AgentTransport;
  publish: (e: JobEvent) => void;
  signal?: AbortSignal;
}): Promise<Diagrams> {
  const formats: MermaidFormat[] = args.formats ?? ["flow", "sequence", "interaction"];
  const systemPrompt = await loadSkillPrompt("task-create-diagrams");
  const userMessage = JSON.stringify({
    requirement: args.requirement,
    story: args.story,
    draft: args.draft,
    formats,
  });

  const buffer = await runSkillToText({
    role: "create-diagrams",
    systemPrompt,
    userMessage,
    transport: args.transport,
    signal: args.signal,
    onProgress: (m) => args.publish({ type: "help_progress", message: m }),
    onError: (e) => args.publish({ type: "error", ...e }),
  });

  const diagrams = parseSkillJson<Diagrams>(buffer, "task-create-diagrams");
  args.publish({ type: "diagrams_created", payload: diagrams });
  return diagrams;
}

export async function runAnalyzeDiagrams(args: {
  requirement: Requirement;
  story: Story;
  mermaid: Diagrams;
  transport: AgentTransport;
  publish: (e: JobEvent) => void;
  signal?: AbortSignal;
}): Promise<import("@/lib/jobs/types").AnalyzeFinding[]> {
  const systemPrompt = await loadSkillPrompt("task-analyze-diagrams");
  const userMessage = JSON.stringify({
    requirement: args.requirement,
    story: args.story,
    mermaid: args.mermaid,
  });

  const buffer = await runSkillToText({
    role: "analyze-diagrams",
    systemPrompt,
    userMessage,
    transport: args.transport,
    signal: args.signal,
    onError: (e) => args.publish({ type: "error", ...e }),
  });

  const parsed = parseSkillJson<{ findings: import("@/lib/jobs/types").AnalyzeFinding[] }>(
    buffer,
    "task-analyze-diagrams",
  );
  const findings = Array.isArray(parsed.findings) ? parsed.findings : [];
  args.publish({ type: "diagrams_analyzed", payload: { findings } });
  return findings;
}

export async function runTitleSuggest(args: {
  draft: { title?: string; description?: string; acceptanceCriteria?: string[]; constraints?: string };
  transport: AgentTransport;
  signal?: AbortSignal;
}): Promise<{ title: string }> {
  const systemPrompt = await loadSkillPrompt("task-title-suggest");
  const userMessage = JSON.stringify({ draft: args.draft });

  let buffer = "";
  let pending: Error | null = null;
  await args.transport.runRole({
    role: "title-suggest",
    systemPrompt,
    userMessage,
    cwd: process.cwd(),
    signal: args.signal,
    onEvent: (e) => {
      if (e.type === "token") buffer += e.text;
      else if (e.type === "error") {
        pending = new Error(`${e.code}: ${e.message}`);
      }
    },
  });

  if (pending) throw pending;

  try {
    const parsed = parseSkillJson<{ title?: unknown }>(buffer, "task-title-suggest");
    const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
    return { title };
  } catch {
    return { title: "" };
  }
}

export async function runHelp(args: {
  surface: "editor" | "diagrams";
  state: { draft: Draft; diagrams?: Diagrams };
  conversation: import("@/lib/jobs/types").HelpMessage[];
  transport: AgentTransport;
  publish: (e: JobEvent) => void;
  signal?: AbortSignal;
}): Promise<{
  text: string;
  done: boolean;
  suggestions?: import("@/lib/jobs/types").HelpSuggestion[];
  proposedEdit?: import("@/lib/jobs/types").ProposedEdit;
}> {
  const systemPrompt = await loadSkillPrompt("task-help");
  const userMessage = JSON.stringify({
    surface: args.surface,
    state: args.state,
    conversation: args.conversation,
  });

  const buffer = await runSkillToText({
    role: "help",
    systemPrompt,
    userMessage,
    transport: args.transport,
    signal: args.signal,
    onError: (e) => args.publish({ type: "error", ...e }),
  });

  // Help Skill output: tolerate either {text, done, suggestions?, proposedEdit?}
  // JSON or bare text from stub. Drop malformed suggestions silently so the
  // chat still works even when only `text` is returned.
  type RawReply = {
    text: string;
    done: boolean;
    suggestions?: import("@/lib/jobs/types").HelpSuggestion[];
    proposedEdit?: import("@/lib/jobs/types").ProposedEdit;
  };
  let reply: RawReply;
  try {
    reply = parseSkillJson<RawReply>(buffer, "task-help");
  } catch {
    reply = { text: buffer.trim(), done: false };
  }
  args.publish({ type: "help_message", text: reply.text });
  if (reply.done) args.publish({ type: "help_done", reason: "ended" });
  return reply;
}

export async function runKnead(args: {
  epicDescription: string;
  rounds: KneadRound[];
  overrideCapApproved?: boolean;
  transport: AgentTransport;
  signal?: AbortSignal;
}): Promise<KneadOutcome> {
  const systemPrompt = await loadSkillPrompt("task-knead");
  const buildMessage = (mustAskFirstRound: boolean) =>
    JSON.stringify({
      epicDescription: args.epicDescription,
      rounds: args.rounds,
      roundNumber: args.rounds.length + 1,
      maxFreeRounds: 5,
      overrideCapApproved: Boolean(args.overrideCapApproved),
      mustAskFirstRound,
    });

  async function callModel(userMessage: string): Promise<string> {
    let buffer = "";
    let pending: Error | null = null;
    await args.transport.runRole({
      role: "knead",
      systemPrompt,
      userMessage,
      cwd: process.cwd(),
      signal: args.signal,
      onEvent: (e) => {
        if (e.type === "token") buffer += e.text;
        else if (e.type === "error") pending = new Error(`${e.code}: ${e.message}`);
      },
    });
    if (pending) throw pending;
    return buffer;
  }

  // First call.
  let raw = await callModel(buildMessage(false));
  let result = parseKneadResponse(raw);

  // Guard: never let the very first round return `complete` without questions.
  // Try once more with mustAskFirstRound=true; if the model still misbehaves,
  // emit the deterministic fallback round so the UI is never stranded.
  if (args.rounds.length === 0 && result.kind === "complete") {
    raw = await callModel(buildMessage(true));
    try {
      result = parseKneadResponse(raw);
    } catch {
      result = { kind: "questions", questions: [...FALLBACK_FIRST_ROUND] };
    }
    if (result.kind === "complete") {
      result = { kind: "questions", questions: [...FALLBACK_FIRST_ROUND] };
    }
  }

  return applyCap(result, args.rounds.length, Boolean(args.overrideCapApproved));
}

export async function runGenerateSubtasks(args: {
  epicDescription: string;
  rounds: KneadRound[];
  transport: AgentTransport;
  signal?: AbortSignal;
}): Promise<ProposedSubtask[]> {
  const systemPrompt = await loadSkillPrompt("task-generate-subtasks");
  const userMessage = JSON.stringify({ epicDescription: args.epicDescription, rounds: args.rounds });

  let buffer = "";
  let pending: Error | null = null;
  await args.transport.runRole({
    role: "generate-subtasks",
    systemPrompt,
    userMessage,
    cwd: process.cwd(),
    signal: args.signal,
    onEvent: (e) => {
      if (e.type === "token") buffer += e.text;
      else if (e.type === "error") pending = new Error(`${e.code}: ${e.message}`);
    },
  });
  if (pending) throw pending;
  return parseSubtasksResponse(buffer);
}

export async function runRefine(args: {
  epicDescription: string;
  draft: { title: string; description: string; acceptanceCriteria: string[]; constraints: string };
  transport: AgentTransport;
  signal?: AbortSignal;
}): Promise<RefineResult> {
  const systemPrompt = await loadSkillPrompt("task-refine");
  const userMessage = JSON.stringify({ epicDescription: args.epicDescription, draft: args.draft });

  let buffer = "";
  let pending: Error | null = null;
  await args.transport.runRole({
    role: "refine",
    systemPrompt,
    userMessage,
    cwd: process.cwd(),
    signal: args.signal,
    onEvent: (e) => {
      if (e.type === "token") buffer += e.text;
      else if (e.type === "error") pending = new Error(`${e.code}: ${e.message}`);
    },
  });
  if (pending) throw pending;
  return parseRefineResponse(buffer);
}

// ---------------------------------------------------------------------------
// Default transport — drives the Anthropic Claude Agent SDK.
// JSON-only skills/roles get no tools (text-only output).
// ---------------------------------------------------------------------------

export function makeDefaultTransport(): AgentTransport {
  return {
    async runRole({ systemPrompt, userMessage, cwd, onEvent, signal }) {
      try {
        const abortController = signal ? wrapSignal(signal) : new AbortController();

        const iter = query({
          prompt: userMessage,
          options: {
            systemPrompt,
            cwd,
            abortController,
            tools: [],
            permissionMode: "bypassPermissions",
            allowDangerouslySkipPermissions: true,
          },
        });

        for await (const msg of iter) {
          if (msg.type === "system" && msg.subtype === "init") {
            onEvent({ type: "progress", message: "session started" });
          } else if (msg.type === "assistant") {
            const content = (msg as { message?: { content?: unknown[] } }).message?.content;
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block && typeof block === "object") {
                  const b = block as { type?: string; text?: string; name?: string };
                  if (b.type === "text" && b.text) {
                    onEvent({ type: "token", text: b.text });
                  } else if (b.type === "tool_use" && b.name) {
                    onEvent({ type: "progress", message: `using ${b.name}` });
                  }
                }
              }
            }
          } else if (msg.type === "result") {
            // terminal — iterator will exit on its own
          }
        }
      } catch (e) {
        const err = e as { message?: string };
        const text = String(err.message ?? e);
        const retriable = !/401|403|invalid_api_key|unauthorized/i.test(text);
        onEvent({
          type: "error",
          code: retriable ? "E_AGENT" : "E_AUTH",
          message: text,
          retriable,
        });
        throw e;
      }
    },
  };
}

function wrapSignal(signal: AbortSignal): AbortController {
  const ac = new AbortController();
  if (signal.aborted) ac.abort();
  else signal.addEventListener("abort", () => ac.abort(), { once: true });
  return ac;
}

// Stub transport for E2E + dev without a Claude token. Returns deterministic
// JSON for every role / skill. Selected when TASK_AGENT_MODE=stub. Never used
// in production.
export function makeStubTransport(): AgentTransport {
  return {
    async runRole({ role, userMessage, onEvent }) {
      onEvent({ type: "progress", message: `${role} (stub) running` });

      if (role === "create-diagrams") {
        const stubDiagrams = {
          flow: "flowchart TD\n  A[Caller] --> B[Validate]\n  B --> C[Stream CSV]\n  B -->|invalid| D[401]",
          sequence:
            "sequenceDiagram\n  participant U as Operator\n  participant S as Server\n  U->>S: GET /export/users\n  S-->>U: 200 + CSV body",
          interaction:
            "graph LR\n  Operator --> ExportUsers\n  ExportUsers --> ViewReconciliation\n  ExportUsers --> RetryOnFail",
        };
        onEvent({ type: "token", text: JSON.stringify(stubDiagrams) });
      } else if (role === "analyze-diagrams") {
        onEvent({ type: "token", text: JSON.stringify({ findings: [] }) });
      } else if (role === "help") {
        onEvent({ type: "token", text: "Stub-help reply: nothing missing." });
      } else if (role === "title-suggest") {
        onEvent({ type: "token", text: JSON.stringify({ title: "Suggested task title (stub)" }) });
      } else if (role === "knead") {
        let priorRounds = 0;
        try {
          const parsed = JSON.parse(userMessage) as { rounds?: unknown[] };
          priorRounds = Array.isArray(parsed.rounds) ? parsed.rounds.length : 0;
        } catch {
          /* ignore — treat as round 1 */
        }
        const payload =
          priorRounds === 0
            ? {
                kind: "questions",
                questions: [
                  { id: "q-surfaces", prompt: "Which product surfaces are impacted?", section: "business", type: "multi", options: ["Web app", "Admin console", "API", "Mobile"] },
                  { id: "q-risk", prompt: "What is the rollout risk?", section: "technical", type: "single", options: ["Low", "Medium", "High"] },
                ],
              }
            : { kind: "complete" };
        onEvent({ type: "token", text: JSON.stringify(payload) });
      } else if (role === "generate-subtasks") {
        const payload = {
          subtasks: [
            { title: "Set up the data model", description: "Define the schema and migrations.", acceptanceCriteria: ["Schema includes a primary key", "Migration runs idempotently"], labels: ["backend"], blocks: [1] },
            { title: "Build the list UI", description: "Render and edit the items.", acceptanceCriteria: ["Items render in alphabetical order", "Add and remove work without page reload"], labels: ["frontend"], blocks: [] },
          ],
        };
        onEvent({ type: "token", text: JSON.stringify(payload) });
      } else if (role === "refine") {
        let title = "Refined sub-task";
        try {
          const parsed = JSON.parse(userMessage) as { draft?: { title?: string } };
          if (parsed.draft?.title) title = `${parsed.draft.title} (refined)`;
        } catch { /* ignore */ }
        onEvent({ type: "token", text: JSON.stringify({ title, description: "Refined description.", acceptanceCriteria: ["Refined AC 1", "Refined AC 2"] }) });
      } else if (role === "analyst") {
        const req = {
          title: "Stub requirement authored by TASK_AGENT_MODE=stub",
          summary: "Stub-mode E2E run — proves the full UI/API/orchestrator pipeline without hitting Claude.",
          problem: "Without a stub mode, every UI test would burn Claude tokens and require network egress.",
          value: "Lets us run Playwright + integration tests deterministically and offline.",
          acceptanceCriteria: [
            "Endpoint returns 200 with a CSV body.",
            "Unauthenticated requests return 401.",
          ],
          outOfScope: [],
          dependencies: [],
          risks: [],
        };
        onEvent({ type: "token", text: JSON.stringify(req) });
      } else if (role === "planner") {
        const story = {
          title: "Stub story authored by TASK_AGENT_MODE=stub",
          markdown: [
            "**As a** developer, **I want to** run the full pipeline without hitting Claude, **so I can** keep tests deterministic and offline-friendly.",
            "",
            "## Scope",
            "- lib/agent stub transport",
            "- tests/lib/finalize.test.ts",
            "",
            "## Requirements",
            "- Stub transport:",
            "  - Return canned analyst + planner JSON when TASK_AGENT_MODE=stub",
            "  - Skip every network call to Anthropic",
            "",
            "## Acceptance criteria",
            "- Both analyst and planner phases complete in stub mode",
            "- A finalized payload is published with no Claude tokens consumed",
          ].join("\n"),
        };
        onEvent({ type: "token", text: JSON.stringify(story) });
      }

      onEvent({ type: "progress", message: `${role} (stub) complete` });
    },
  };
}

// Single entry point the orchestrator uses. Switches on TASK_AGENT_MODE so
// the same code path drives both real Claude and the stub.
export function makeTransport(): AgentTransport {
  return process.env.TASK_AGENT_MODE === "stub" ? makeStubTransport() : makeDefaultTransport();
}

export type { AgentTransport, AgentEvent } from "./types";
