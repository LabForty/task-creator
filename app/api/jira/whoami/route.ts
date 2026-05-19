import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isConfigured, readSessionCookie } from "@/lib/jira";

export const runtime = "nodejs";

/**
 * Browser-friendly diagnostics endpoint. Visit directly in the main tab
 * after attempting Connect — shows exactly what cookies the server received
 * on this origin and whether the session decrypts.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const all = jar.getAll();
  const sessionChunks = all.filter((c) => /^jira_session_\d+$/.test(c.name));
  const rawSession = sessionChunks.length > 0
    ? sessionChunks
        .sort((a, b) => parseInt(a.name.split("_")[2]) - parseInt(b.name.split("_")[2]))
        .map((c) => c.value)
        .join("")
    : null;
  const rawState = jar.get("jira_oauth_state")?.value ?? null;

  let session = null;
  let decryptError: string | null = null;
  try {
    session = await readSessionCookie();
  } catch (e) {
    decryptError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({
    requestOrigin: url.origin,
    requestHost: req.headers.get("host"),
    configured: isConfigured(),
    cookieNamesReceived: all.map((c) => c.name),
    sessionCookiePresent: !!rawSession,
    sessionCookieLength: rawSession?.length ?? 0,
    stateCookiePresent: !!rawState,
    sessionDecryptable: !!session,
    decryptError,
    sessionPreview: session
      ? {
          accountId: session.accountId,
          email: session.email ?? null,
          expiresAt: new Date(session.expiresAt).toISOString(),
          accessTokenPrefix: session.accessToken.slice(0, 8) + "…",
        }
      : null,
  });
}
