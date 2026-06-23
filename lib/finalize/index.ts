import * as defaultAgent from "@/lib/agent";
import { publish, getJob } from "@/lib/jobs";
import { renderFinalized } from "@/lib/render";
import { checkConsistency } from "@/lib/pipeline";
import { readTemplate } from "@/lib/templates/sync";
import { resolveSourceContext } from "@/lib/context/sources";
import type { DraftInput, Requirement, Story, GateResult, SourceContextItem } from "@/lib/pipeline";
import type { AgentTransport } from "@/lib/agent/types";
import type { JobEvent } from "@/lib/jobs/types";

type AgentModule = {
  runAnalyst: (args: {
    draft: DraftInput;
    transport: AgentTransport;
    publish: (e: JobEvent) => void;
    retryHint?: string[];
  }) => Promise<{ requirement: Requirement }>;
  runPlanner: (args: {
    requirement: Requirement;
    draft: DraftInput;
    transport: AgentTransport;
    publish: (e: JobEvent) => void;
    retryHint?: string[];
    template?: { key: string; content: string };
  }) => Promise<{ story: Story }>;
  makeTransport: () => AgentTransport;
  makeDefaultTransport?: () => AgentTransport;
};

export type FinalizeDeps = {
  agent?: AgentModule;
  resolveSourceContext?: (links: readonly string[] | undefined) => Promise<SourceContextItem[]>;
};

type RoleErr = Error & { gateErrors?: string[] };

function gateErrorsOf(err: unknown): string[] {
  if (err && typeof err === "object" && Array.isArray((err as RoleErr).gateErrors)) {
    return (err as RoleErr).gateErrors as string[];
  }
  return [];
}

async function runAnalystWithRetry(
  agent: AgentModule,
  args: {
    draft: DraftInput;
    transport: AgentTransport;
    publish: (e: JobEvent) => void;
  },
): Promise<{ requirement: Requirement; schema: GateResult }> {
  try {
    const { requirement } = await agent.runAnalyst(args);
    return { requirement, schema: { gate: "schema", ok: true } };
  } catch (err) {
    const errors = gateErrorsOf(err);
    if (!errors.length) throw err;
    // One retry: tell the analyst exactly what to fix.
    args.publish({ type: "gate_result", gate: "schema", ok: false, errors });
    const { requirement } = await agent.runAnalyst({ ...args, retryHint: errors });
    return { requirement, schema: { gate: "schema", ok: true } };
  }
}

async function runPlannerWithRetry(
  agent: AgentModule,
  args: {
    requirement: Requirement;
    draft: DraftInput;
    transport: AgentTransport;
    publish: (e: JobEvent) => void;
    template?: { key: string; content: string };
  },
): Promise<{ story: Story; schema: GateResult }> {
  try {
    const { story } = await agent.runPlanner(args);
    return { story, schema: { gate: "schema", ok: true } };
  } catch (err) {
    const errors = gateErrorsOf(err);
    if (!errors.length) throw err;
    args.publish({ type: "gate_result", gate: "schema", ok: false, errors });
    const { story } = await agent.runPlanner({ ...args, retryHint: errors });
    return { story, schema: { gate: "schema", ok: true } };
  }
}

async function withResolvedSourceContext(
  draft: DraftInput,
  deps?: FinalizeDeps,
): Promise<DraftInput> {
  if (!draft.contextLinks?.length) return draft;
  const resolver = deps?.resolveSourceContext ?? resolveSourceContext;
  try {
    const sourceContext = await resolver(draft.contextLinks);
    return sourceContext.length ? { ...draft, sourceContext } : draft;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      ...draft,
      sourceContext: draft.contextLinks.map((url) => ({
        url,
        kind: "web",
        status: "unresolved",
        error,
      })),
    };
  }
}

export async function runFinalize(opts: {
  jobId: string;
  draft: DraftInput;
  options?: { stakeholder?: string };
  deps?: FinalizeDeps;
}): Promise<void> {
  const agent = opts.deps?.agent ?? (defaultAgent as unknown as AgentModule);
  const transport = agent.makeTransport();
  const publishEvent = (e: JobEvent) => publish(opts.jobId, e);

  try {
    const draft = await withResolvedSourceContext(opts.draft, opts.deps);

    // --- ANALYST phase ---
    const { requirement, schema: analystSchema } = await runAnalystWithRetry(agent, {
      draft,
      transport,
      publish: publishEvent,
    });
    publishEvent({ type: "gate_result", gate: "schema", ok: analystSchema.ok });

    // --- PLANNER phase ---
    // Load the selected task-type template (from prompts/types/<key>.md).
    // If the user didn't pick one or the file is missing, the planner falls
    // back to the in-repo default. taskType is optional on DraftInput.
    const taskType = (draft as DraftInput & { taskType?: string }).taskType?.trim();
    const templateContent = taskType ? await readTemplate(taskType) : null;
    const template = taskType && templateContent
      ? { key: taskType, content: templateContent }
      : undefined;

    const { story, schema: plannerSchema } = await runPlannerWithRetry(agent, {
      requirement,
      draft,
      transport,
      publish: publishEvent,
      template,
    });
    publishEvent({ type: "gate_result", gate: "schema", ok: plannerSchema.ok });

    // --- Consistency check (in-process, deterministic) ---
    const consistency = checkConsistency(requirement, story);
    publishEvent({
      type: "gate_result",
      gate: "consistency",
      ok: consistency.ok,
      errors: consistency.ok ? undefined : consistency.errors,
    });

    // --- Render markdown ---
    // Diagrams are embedded later (client-side) once they exist; the initial
    // finalize render produces the body only.
    const markdown = renderFinalized(requirement, story, { constraints: draft.constraints });

    const payload = {
      requirement,
      story,
      gates: { schema: analystSchema, consistency },
      markdown,
      downloadUrls: {
        requirement: `/api/jobs/${opts.jobId}/download/requirement`,
        story: `/api/jobs/${opts.jobId}/download/story`,
        markdown: `/api/jobs/${opts.jobId}/download/markdown`,
      },
    };

    if (!consistency.ok) {
      publishEvent({ type: "gates_failed", payload });
      return;
    }

    publishEvent({ type: "finalized", payload });
  } catch (err) {
    if (getJob(opts.jobId)?.status !== "error") {
      const message = err instanceof Error ? err.message : String(err);
      publishEvent({ type: "error", code: "E_INTERNAL", message, retriable: true });
    }
  }
}
