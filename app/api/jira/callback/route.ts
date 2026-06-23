import { NextResponse } from "next/server";
import {
  JiraError,
  clearStateCookieOnResponse,
  constantTimeEquals,
  exchangeCodeForTokens,
  listAccessibleResources,
  resolveAccountIdentity,
  readConfig,
  readStateCookie,
  resolveRedirectUri,
  setSessionCookieOnResponse,
  type JiraSession,
} from "@/lib/jira";
import { sanitizeReturnPath } from "@/lib/auth/returnPath";

export const runtime = "nodejs";

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildPopupHtml(
  origin: string,
  outcome: "connected" | "error",
  reason: string | null,
): string {
  const status = outcome === "connected" ? "Connected to Jira" : "Couldn't connect to Jira";
  const body =
    outcome === "connected"
      ? "You can close this tab and return to Task Creator."
      : `Reason: ${reason ?? "unknown"}`;
  const payload = JSON.stringify({
    type: "task-creator:jira",
    outcome,
    reason: reason ?? null,
  });
  const isErr = outcome === "error";
  const autoClose = isErr
    ? ""
    : `setTimeout(function () { try { window.close(); } catch (e) {} }, 800);`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${htmlEscape(status)}</title>
<style>
  :root{--ink:#1d1d1f;--surface:#f5f5f7;--danger:#bf2828;--rule:#d2d2d7;} /* design-tokens-allow: standalone OAuth popup mirrors globals.css tokens */
  body { font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 2rem; color: var(--ink); background: var(--surface); }
  .card { max-width: 36rem; margin: 0 auto; background: white; border-radius: 12px; padding: 1.5rem 2rem; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
  h1 { font-size: 1.25rem; margin: 0 0 0.75rem; color: ${isErr ? "var(--danger)" : "var(--ink)"}; }
  pre { white-space: pre-wrap; word-break: break-word; margin: 0 0 1rem; padding: 0.75rem 1rem; background: var(--surface); border-radius: 8px; font: 12px/1.5 Menlo, Consolas, monospace; }
  button { font: inherit; padding: 0.5rem 1rem; border-radius: 8px; border: 1px solid var(--rule); background: white; cursor: pointer; }
  button:hover { background: var(--surface); }
</style>
</head><body>
  <div class="card">
    <h1>${htmlEscape(status)}</h1>
    <pre>${htmlEscape(body)}</pre>
    <button type="button" onclick="window.close()">Close</button>
  </div>
  <script>
    (function () {
      try {
        var payload = ${payload};
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(payload, ${JSON.stringify(origin)});
        }
      } catch (e) { /* ignore */ }
      ${autoClose}
    })();
  </script>
</body></html>`;
}

type Outcome = "connected" | "error";

function originFromUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return url.origin;
  } catch {
    // Fall through to caller fallback.
  }
  return null;
}

function buildPopupResponse(
  origin: string,
  outcome: Outcome,
  reason: string | null,
): NextResponse {
  return new NextResponse(buildPopupHtml(origin, outcome, reason), {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function buildFullRedirect(
  origin: string,
  outcome: Outcome,
  reason: string | null,
  returnPath: string,
): NextResponse {
  if (outcome === "connected") {
    return NextResponse.redirect(new URL(returnPath, origin));
  }
  const qs = new URLSearchParams({
    error: reason ?? "unknown",
    return: returnPath,
  }).toString();
  return NextResponse.redirect(new URL(`/signin?${qs}`, origin));
}

function parseStateCookie(value: string | null): {
  nonce: string;
  popup: boolean;
  redirectUri: string;
  returnPath: string;
} | null {
  if (!value) return null;
  const parts = value.split("|");
  if (parts.length < 3) {
    return { nonce: value, popup: false, redirectUri: "", returnPath: "/" };
  }
  // 4-segment shape: nonce | popup | redirectUri | returnPath
  // Older 3-segment cookies (no returnPath) still decode safely.
  const nonce = parts[0];
  const popup = parts[1] === "1";
  let redirectUri = "";
  let returnPath = "/";
  if (parts.length >= 4) {
    redirectUri = decodeURIComponent(parts[2]);
    returnPath = sanitizeReturnPath(decodeURIComponent(parts[3]));
  } else {
    redirectUri = decodeURIComponent(parts.slice(2).join("|"));
  }
  return { nonce, popup, redirectUri, returnPath };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const requestOrigin = url.origin;

  console.log(`[jira/callback] hit url=${url.pathname}${url.search} origin=${requestOrigin} host=${req.headers.get("host")}`);

  const stateCookieValue = await readStateCookie();
  const parsedState = parseStateCookie(stateCookieValue);
  const isPopup = parsedState?.popup ?? false;
  const returnPath = parsedState?.returnPath ?? "/";
  const responseOrigin =
    originFromUrl(parsedState?.redirectUri) ??
    originFromUrl(process.env.JIRA_REDIRECT_URI) ??
    requestOrigin;
  console.log(`[jira/callback] stateCookie=${stateCookieValue ? "present" : "MISSING"} popup=${isPopup} returnPath=${returnPath}`);

  // Build response on demand and always clear the state cookie at the end.
  const finish = async (
    outcome: Outcome,
    reason: string | null,
    session: JiraSession | null,
  ): Promise<NextResponse> => {
    const res = isPopup
      ? buildPopupResponse(responseOrigin, outcome, reason)
      : buildFullRedirect(responseOrigin, outcome, reason, returnPath);
    if (session) await setSessionCookieOnResponse(res, session);
    clearStateCookieOnResponse(res);
    const setCookieHeaders = res.headers.getSetCookie?.() ?? [];
    console.log(
      `[jira/callback] finish outcome=${outcome} reason=${reason ?? "ok"} setCookieCount=${setCookieHeaders.length}`,
    );
    for (const sc of setCookieHeaders) {
      const preview = sc.length > 120 ? `${sc.slice(0, 60)}…${sc.slice(-60)}` : sc;
      console.log(`[jira/callback]   set-cookie (${sc.length} bytes): ${preview}`);
    }
    return res;
  };

  const oauthErr = url.searchParams.get("error");
  if (oauthErr) {
    console.error(`[jira/callback] oauth error from Atlassian: ${oauthErr}`);
    return await finish(
      "error",
      `${oauthErr}: ${url.searchParams.get("error_description") ?? ""}`.trim(),
      null,
    );
  }
  const code = url.searchParams.get("code");
  const stateFromUrl = url.searchParams.get("state");
  if (!code || !stateFromUrl) {
    return await finish("error", "missing code or state in callback", null);
  }

  let cfg;
  try {
    cfg = readConfig();
  } catch (err) {
    return await finish("error", err instanceof JiraError ? err.message : "config error", null);
  }

  if (!parsedState || !constantTimeEquals(parsedState.nonce, stateFromUrl)) {
    console.error(`[jira/callback] state mismatch — cookie=${parsedState?.nonce?.slice(0, 8)}… url=${stateFromUrl.slice(0, 8)}…`);
    return await finish("error", "state mismatch — possible CSRF or expired flow", null);
  }

  const redirectUri = parsedState.redirectUri || resolveRedirectUri(cfg, req.url);

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code, redirectUri, cfg);
  } catch (err) {
    console.error("[jira/callback] token exchange failed:", err);
    return await finish("error", err instanceof Error ? err.message : "token exchange failed", null);
  }

  let resources;
  try {
    resources = await listAccessibleResources(tokens.access_token);
  } catch (err) {
    console.error("[jira/callback] accessible-resources failed:", err);
    return await finish("error", err instanceof Error ? err.message : "accessible-resources failed", null);
  }
  if (resources.length === 0) {
    console.error("[jira/callback] accessible-resources returned 0 sites");
    return await finish(
      "error",
      "Atlassian returned no Jira sites for this account. Make sure you picked a site on the consent screen.",
      null,
    );
  }

  // /me needs the read:me scope (which we don't request); fall back to the
  // cloud-scoped /myself so the session always carries a real accountId —
  // drafts are scoped by it, and "" would pool every user together (AI-50).
  const identity = await resolveAccountIdentity(tokens.access_token, resources[0].id);
  const session: JiraSession = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
    accountId: identity.accountId,
    email: identity.email,
  };

  console.log(
    `[jira/callback] connected accountId=${session.accountId || "(none)"} email=${session.email ?? "(none)"} sites=${resources.length}`,
  );

  return await finish("connected", null, session);
}
