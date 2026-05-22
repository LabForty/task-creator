import { JiraError } from "./errors";
import { MAX_DRAFT_ATTACHMENT_BYTES_DEFAULT } from "./metadata";

export type JiraConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  cookieSecret: string;
  redirectUriFromEnv: boolean;
};

const SCOPES = [
  "read:jira-work",
  "write:jira-work",
  "read:jira-user",
  "offline_access",
];

export function getScopes(): string[] {
  return SCOPES;
}

export function readConfig(): JiraConfig {
  const clientId = process.env.JIRA_CLIENT_ID;
  const clientSecret = process.env.JIRA_CLIENT_SECRET;
  const cookieSecret = process.env.JIRA_COOKIE_SECRET;
  const envRedirect = process.env.JIRA_REDIRECT_URI;
  const redirectUri = envRedirect && envRedirect.trim().length > 0
    ? envRedirect
    : "http://127.0.0.1:3000/api/jira/callback";
  const redirectUriFromEnv = !!(envRedirect && envRedirect.trim().length > 0);

  const missing: string[] = [];
  if (!clientId) missing.push("JIRA_CLIENT_ID");
  if (!clientSecret) missing.push("JIRA_CLIENT_SECRET");
  if (!cookieSecret) missing.push("JIRA_COOKIE_SECRET");
  if (missing.length > 0) {
    throw new JiraError(
      "config",
      `Jira integration not configured. Missing env: ${missing.join(", ")}.`,
      500,
    );
  }
  if ((cookieSecret as string).length < 32) {
    throw new JiraError(
      "config",
      "JIRA_COOKIE_SECRET must be at least 32 characters long.",
      500,
    );
  }
  return {
    clientId: clientId as string,
    clientSecret: clientSecret as string,
    cookieSecret: cookieSecret as string,
    redirectUri,
    redirectUriFromEnv,
  };
}

/**
 * Build a redirect_uri from the request when no JIRA_REDIRECT_URI is set in env.
 * Lets the app work whether you open it at 127.0.0.1:3000, localhost:3000, or
 * a tunneled hostname — as long as the SAME hostname is registered as a
 * callback URL in the Atlassian developer console.
 */
export function resolveRedirectUri(cfg: JiraConfig, requestUrl: string): string {
  if (cfg.redirectUriFromEnv) return cfg.redirectUri;
  try {
    const u = new URL(requestUrl);
    return `${u.origin}/api/jira/callback`;
  } catch {
    return cfg.redirectUri;
  }
}

export function isConfigured(): boolean {
  try {
    readConfig();
    return true;
  } catch {
    return false;
  }
}

export function readDraftAttachmentMaxBytes(): number {
  const raw = process.env.JIRA_DRAFT_ATTACHMENT_MAX_MB;
  if (!raw) return MAX_DRAFT_ATTACHMENT_BYTES_DEFAULT;
  const mb = Number.parseInt(raw, 10);
  if (!Number.isFinite(mb) || mb <= 0) return MAX_DRAFT_ATTACHMENT_BYTES_DEFAULT;
  return mb * 1024 * 1024;
}
