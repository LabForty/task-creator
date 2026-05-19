/**
 * One-shot end-to-end demo of the Finalize pipeline.
 *
 * Usage (PowerShell):
 *   $env:CLAUDE_CODE_OAUTH_TOKEN = "<your token from `claude setup-token`>"
 *   npm run finalize:demo
 *
 * Usage (bash):
 *   CLAUDE_CODE_OAUTH_TOKEN=<token> npm run finalize:demo
 *
 * What it does:
 *   1. Creates a job in the in-memory job store.
 *   2. Subscribes to job events and streams them to stdout as they fire.
 *   3. Calls runFinalize() which:
 *        - runs the analyst role (via @anthropic-ai/claude-agent-sdk)
 *        - validates the requirement against the Zod schema
 *        - runs the planner role
 *        - validates the user story against the Zod schema
 *        - runs the consistency gate (in-process)
 *        - renders the Jira-ready markdown
 *   4. Prints the final result (or the error / partial gates_failed payload).
 *
 * No write to source control happens. Everything is in-memory.
 */
import { existsSync } from "node:fs";
import process from "node:process";

// Pick up CLAUDE_CODE_OAUTH_TOKEN (and other vars) from .env.local if present.
// Node 20.12+ provides loadEnvFile natively; no dotenv dependency needed.
if (existsSync(".env.local") && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(".env.local");
}

import { createJob, subscribe, getJob } from "@/lib/jobs";
import { runFinalize } from "@/lib/finalize";
import type { JobEvent } from "@/lib/jobs/types";

const DEMO_DRAFT = {
  title: "Add CSV export for users",
  description:
    "Ops needs an authenticated endpoint that returns the current user list as a CSV. " +
    "Today they hand-export from the database, which is error-prone and has caused " +
    "billing discrepancies in the past quarter (incidents IR-0042 and IR-0051).",
  useCases:
    "Monthly billing reconciliation: ops calls this endpoint at month-end, diffs " +
    "the rows against the billing system, surfaces mismatches to a slack channel.",
  acceptanceCriteria: [
    "An authenticated operator can request a CSV export from the operator console.",
    "Each row contains: id, email, status, created_at, last_active_at — in that order.",
    "The endpoint streams the response so memory usage does not scale with row count.",
  ],
  constraints:
    "Reuse the existing operator-session auth. No new permission system.",
};

function truncate(s: string, n = 200): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function fmt(e: JobEvent): string {
  switch (e.type) {
    case "role_started":
      return `▶ ${e.role} started`;
    case "role_progress":
      return `  ${e.role}: ${e.message}`;
    case "role_token":
      return `  ${e.role}: ${truncate(e.token.replace(/\s+/g, " "), 120)}`;
    case "gate_result":
      return `  gate ${e.gate}: ${e.ok ? "✓ pass" : "✗ FAIL — " + (e.errors ?? []).join("; ")}`;
    case "role_finished":
      return `▣ ${e.role} finished → ${e.artifactId}`;
    case "finalized":
      return `✓ finalized: ${e.payload.requirement.title} + ${e.payload.story.title}`;
    case "gates_failed":
      return `✗ gates failed — partial result available`;
    case "diagrams_created":
      return `▣ diagrams created`;
    case "diagrams_analyzed":
      return `▣ diagrams analyzed (${e.payload.findings.length} findings)`;
    case "diagrams_applied":
      return `✓ diagram sync applied`;
    case "help_progress":
      return `  help: ${e.message}`;
    case "help_message":
      return `  help: ${truncate(e.text.replace(/\s+/g, " "), 120)}`;
    case "help_done":
      return `▣ help done (${e.reason})`;
    case "error":
      return `✗ error [${e.code}${e.retriable ? ", retriable" : ""}]: ${e.message}`;
  }
}

async function main() {
  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN && !process.env.ANTHROPIC_API_KEY) {
    console.error(
      "Neither CLAUDE_CODE_OAUTH_TOKEN nor ANTHROPIC_API_KEY is set in the environment.\n" +
        "Run `claude setup-token` (one-time) and then export the token:\n" +
        '  PowerShell:  $env:CLAUDE_CODE_OAUTH_TOKEN = "<token>"\n' +
        "  bash:        export CLAUDE_CODE_OAUTH_TOKEN=<token>",
    );
    process.exit(1);
  }

  const job = createJob();
  console.log(`Job ${job.id}`);
  console.log("Submitting draft:", DEMO_DRAFT.title);
  console.log("");

  subscribe(job.id, (e) => console.log(fmt(e)));

  const started = Date.now();
  await runFinalize({ jobId: job.id, draft: DEMO_DRAFT });
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`\n--- FINISHED in ${elapsed}s ---`);
  const final = getJob(job.id);
  if (!final) {
    console.error("Job vanished from store?");
    process.exit(2);
  }

  console.log(`Status: ${final.status}`);

  if (final.error) {
    console.error("Error:", final.error);
    process.exit(3);
  }

  if (final.result) {
    const { requirement, story, gates, markdown } = final.result;
    console.log(`\nRequirement: ${requirement.title}`);
    console.log(`Story: ${story.title}`);
    console.log(`Gates: schema=${gates.schema.ok ? "ok" : "FAIL"}, consistency=${gates.consistency.ok ? "ok" : "FAIL"}`);
    console.log("\n--- RENDERED MARKDOWN ---\n");
    console.log(markdown);
    console.log("\n--- REQUIREMENT JSON ---\n");
    console.log(JSON.stringify(requirement, null, 2));
    console.log("\n--- STORY JSON ---\n");
    console.log(JSON.stringify(story, null, 2));
  }
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(99);
});
