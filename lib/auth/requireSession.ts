import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import {
  JiraError,
  clearSessionCookie,
  getValidSession,
  isConfigured,
  type JiraSession,
} from "@/lib/jira";
import { sanitizeReturnPath } from "./returnPath";

function describeError(err: unknown): string {
  if (err instanceof JiraError) {
    return `JiraError(${err.code}, status=${err.status}): ${err.message}`;
  }
  if (err instanceof Error) return `${err.constructor.name}: ${err.message}`;
  return String(err);
}

// For API routes: returns the live session, or a NextResponse to short-circuit.
export async function requireSession(): Promise<JiraSession | NextResponse> {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "jira_not_configured" },
      { status: 503 },
    );
  }
  try {
    return await getValidSession();
  } catch (err) {
    console.warn(`[auth] requireSession: ${describeError(err)}`);
    if (err instanceof JiraError && err.code === "not_connected") {
      return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
    }
    // Refresh failure (revoked / expired refresh token, network blip) —
    // treat as unauthenticated so the client redirects to /signin.
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
}

// For server components: redirect to /signin when no session.
// Always throws (via next/navigation `redirect`) when unauthenticated; the
// non-void return type is just for narrowing in the caller.
export async function requireSessionOrRedirect(
  returnPath: string,
): Promise<JiraSession> {
  if (!isConfigured()) {
    redirect(`/signin?error=${encodeURIComponent("jira_not_configured")}`);
  }
  let session: JiraSession | null = null;
  let failure: unknown = null;
  try {
    session = await getValidSession();
  } catch (err) {
    failure = err;
  }

  if (session) return session;

  console.warn(`[auth] requireSessionOrRedirect: ${describeError(failure)}`);

  // Distinguish "never signed in" (clean redirect, no error chip) from
  // "had a session but refresh blew up" (show the user why). Token-refresh
  // failure also clears the dead session so the next /signin round-trip
  // starts clean instead of looping on the same broken record.
  const refreshDied =
    failure instanceof JiraError &&
    (failure.code === "token_refresh_failed" ||
      failure.code === "token_exchange_failed");

  if (refreshDied) {
    try {
      await clearSessionCookie();
    } catch (cleanupErr) {
      console.warn(`[auth] failed to clear stale session: ${describeError(cleanupErr)}`);
    }
  }

  const safe = sanitizeReturnPath(returnPath);
  const params = new URLSearchParams({ return: safe });
  if (refreshDied) params.set("error", "session_expired");
  redirect(`/signin?${params.toString()}`);
}

export { sanitizeReturnPath };
