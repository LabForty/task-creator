export type JiraErrorCode =
  | "config"
  | "not_connected"
  | "state_mismatch"
  | "token_exchange_failed"
  | "token_refresh_failed"
  | "no_accessible_sites"
  | "api_error"
  | "network";

export class JiraError extends Error {
  readonly code: JiraErrorCode;
  readonly status: number;
  readonly details?: unknown;
  constructor(code: JiraErrorCode, message: string, status = 500, details?: unknown) {
    super(message);
    this.name = "JiraError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function isJiraError(e: unknown): e is JiraError {
  return e instanceof JiraError;
}
