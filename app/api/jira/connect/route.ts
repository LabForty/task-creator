import { NextResponse } from "next/server";
import {
  JiraError,
  buildAuthorizeUrl,
  buildStateNonce,
  readConfig,
  resolveRedirectUri,
  setStateCookieOnResponse,
} from "@/lib/jira";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;

  let cfg;
  try {
    cfg = readConfig();
  } catch (err) {
    const msg = err instanceof JiraError ? err.message : "Jira is not configured.";
    return NextResponse.redirect(
      new URL(`/?jira=error&reason=${encodeURIComponent(msg)}`, origin),
    );
  }

  const redirectUri = resolveRedirectUri(cfg, req.url);
  const nonce = buildStateNonce();
  const popup = url.searchParams.get("popup") === "1";
  const stateValue = `${nonce}|${popup ? "1" : "0"}|${encodeURIComponent(redirectUri)}`;
  const authorizeUrl = buildAuthorizeUrl(nonce, redirectUri, cfg);
  const res = NextResponse.redirect(authorizeUrl);
  setStateCookieOnResponse(res, stateValue);
  return res;
}
