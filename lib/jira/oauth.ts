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

export type AccountIdentity = { accountId: string; email?: string };

// Cloud-scoped variant of /me. Unlike /me (which needs the read:me scope we
// don't request), /rest/api/3/myself is covered by read:jira-user.
export async function fetchMyself(
  accessToken: string,
  cloudId: string,
): Promise<AccountIdentity | null> {
  try {
    const res = await fetch(
      `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/myself`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: "application/json",
        },
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { accountId?: string; emailAddress?: string };
    if (!json.accountId) return null;
    return { accountId: json.accountId, email: json.emailAddress };
  } catch {
    return null;
  }
}

// Best-effort accountId lookup: /me first, then /myself on the given cloudId
// (or the first accessible site when none is given). Returns accountId ""
// only when every avenue fails — callers must treat that as "unknown".
export async function resolveAccountIdentity(
  accessToken: string,
  cloudId?: string,
): Promise<AccountIdentity> {
  try {
    const me = await fetchMe(accessToken);
    if (me.account_id) return { accountId: me.account_id, email: me.email };
  } catch {
    /* fall through to /myself */
  }
  try {
    const cid = cloudId ?? (await listAccessibleResources(accessToken))[0]?.id;
    const myself = cid ? await fetchMyself(accessToken, cid) : null;
    if (myself) return myself;
  } catch {
    /* unresolved */
  }
  return { accountId: "" };
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
  let current = session;
  const msUntilExpiry = current.expiresAt - Date.now();
  if (msUntilExpiry <= REFRESH_LEEWAY_MS) {
    console.log(`[jira/oauth] token near/past expiry (${msUntilExpiry}ms left) — refreshing`);
    try {
      const refreshed = await refreshTokens(current.refreshToken);
      current = {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        expiresAt: Date.now() + refreshed.expires_in * 1000,
        accountId: current.accountId,
        email: current.email,
      };
      await writeSessionCookie(current);
      console.log(`[jira/oauth] refresh OK, new expiresAt=${new Date(current.expiresAt).toISOString()}`);
    } catch (err) {
      console.error(`[jira/oauth] refresh failed:`, err);
      throw err;
    }
  }
  // Heal sessions stored with an empty accountId (sign-ins from before the
  // /myself fallback existed). Per-account data — drafts — is unusable until
  // the id is known, so backfill and persist as soon as we can resolve it.
  if (!current.accountId) {
    const identity = await resolveAccountIdentity(current.accessToken);
    if (identity.accountId) {
      current = {
        ...current,
        accountId: identity.accountId,
        email: current.email ?? identity.email,
      };
      await writeSessionCookie(current);
      console.log(`[jira/oauth] backfilled missing accountId=${identity.accountId}`);
    }
  }
  return current;
}
