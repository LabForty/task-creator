import { JiraError } from "./errors";
import { getScopes, readConfig, type JiraConfig } from "./config";
import {
  readSessionCookie,
  writeSessionCookie,
  type JiraSession,
} from "./cookies";

const AUTHORIZE_URL = "https://auth.atlassian.com/authorize";
const TOKEN_URL = "https://auth.atlassian.com/oauth/token";
const ACCESSIBLE_RESOURCES_URL =
  "https://api.atlassian.com/oauth/token/accessible-resources";
const ME_URL = "https://api.atlassian.com/me";

const REFRESH_LEEWAY_MS = 60_000;

export function buildAuthorizeUrl(
  state: string,
  redirectUri: string,
  cfg: JiraConfig = readConfig(),
): string {
  const params = new URLSearchParams({
    audience: "api.atlassian.com",
    client_id: cfg.clientId,
    scope: getScopes().join(" "),
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    prompt: "consent",
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
};

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new JiraError(
      body.grant_type === "refresh_token" ? "token_refresh_failed" : "token_exchange_failed",
      `Atlassian token endpoint returned ${res.status}: ${text.slice(0, 400)}`,
      res.status,
    );
  }
  const json = (await res.json()) as TokenResponse;
  if (!json.access_token || !json.refresh_token || typeof json.expires_in !== "number") {
    throw new JiraError(
      "token_exchange_failed",
      "Atlassian token response missing required fields",
      502,
    );
  }
  return json;
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
  cfg: JiraConfig = readConfig(),
) {
  return postToken({
    grant_type: "authorization_code",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    redirect_uri: redirectUri,
  });
}

export async function refreshTokens(refreshToken: string, cfg: JiraConfig = readConfig()) {
  return postToken({
    grant_type: "refresh_token",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: refreshToken,
  });
}

export type AccessibleResource = {
  id: string; // cloudId
  url: string;
  name: string;
  scopes: string[];
  avatarUrl?: string;
};

export async function listAccessibleResources(accessToken: string): Promise<AccessibleResource[]> {
  const res = await fetch(ACCESSIBLE_RESOURCES_URL, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new JiraError(
      "api_error",
      `accessible-resources returned ${res.status}: ${text.slice(0, 300)}`,
      res.status,
    );
  }
  return (await res.json()) as AccessibleResource[];
}

type Me = { account_id: string; email?: string; name?: string };

export async function fetchMe(accessToken: string): Promise<Me> {
  const res = await fetch(ME_URL, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    },
  });
  if (!res.ok) {
    // /me is best-effort — failure shouldn't break the OAuth flow.
    return { account_id: "" };
  }
  return (await res.json()) as Me;
}

/**
 * Read the current session and refresh if it's near expiry. Writes the new
 * cookie value when a refresh happens. Throws not_connected if no session.
 */
export async function getValidSession(): Promise<JiraSession> {
  const session = await readSessionCookie();
  if (!session) {
    throw new JiraError("not_connected", "Not connected to Jira.", 401);
  }
  const msUntilExpiry = session.expiresAt - Date.now();
  if (msUntilExpiry > REFRESH_LEEWAY_MS) {
    return session;
  }
  console.log(`[jira/oauth] token near/past expiry (${msUntilExpiry}ms left) — refreshing`);
  try {
    const refreshed = await refreshTokens(session.refreshToken);
    const next: JiraSession = {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      expiresAt: Date.now() + refreshed.expires_in * 1000,
      accountId: session.accountId,
      email: session.email,
    };
    await writeSessionCookie(next);
    console.log(`[jira/oauth] refresh OK, new expiresAt=${new Date(next.expiresAt).toISOString()}`);
    return next;
  } catch (err) {
    console.error(`[jira/oauth] refresh failed:`, err);
    throw err;
  }
}
