import type { JobEvent } from "@/lib/jobs/types";

// Label for the AI invocation, used by the transport for telemetry / stub
// routing only. Role names (analyst, planner) and Skill names
// (create-diagrams, analyze-diagrams, help, title-suggest) flow through the
// same transport.
export type RoleLabel = string;

export type AgentEvent =
  | { type: "progress"; message: string }
  | { type: "token"; text: string }
  | { type: "error"; code: string; message: string; retriable: boolean };

export type RunRoleInput = {
  role: RoleLabel;
  systemPrompt: string;
  userMessage: string;
  cwd: string;
  onEvent: (e: AgentEvent) => void;
  signal?: AbortSignal;
};

export type AgentTransport = {
  runRole(input: RunRoleInput): Promise<void>;
};

export type RunArgs = {
  transport: AgentTransport;
  publish: (e: JobEvent) => void;
  signal?: AbortSignal;
};
