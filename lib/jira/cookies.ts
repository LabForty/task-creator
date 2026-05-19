import { randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

const SESSION_COOKIE = "jira_sid";
const STATE_COOKIE = "jira_oauth_state";
const LEGACY_SESSION_COOKIE = "jira_session";
const LEGACY_SESSION_CHUNK_PREFIX = "jira_session_";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;
const STATE_MAX_AGE_SECONDS = 60 * 10;

function cookieShouldBeSecure(): boolean {
  return process.env.JIRA_SECURE_COOKIE === "true";
}

function cookieAttrs(maxAge: number) {
  return {
    httpOnly: true,
    secure: cookieShouldBeSecure(),
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

// ---------------------------------------------------------------------------
// Session-id cookie — small, opaque pointer into the server-side store.
// ---------------------------------------------------------------------------

export async function writeSessionIdCookie(sessionId: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, sessionId, cookieAttrs(SESSION_MAX_AGE_SECONDS));
}

export async function readSessionIdCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}

export async function clearSessionIdCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", cookieAttrs(0));
}

export function setSessionIdCookieOnResponse(res: NextResponse, sessionId: string): void {
  res.cookies.set(SESSION_COOKIE, sessionId, cookieAttrs(SESSION_MAX_AGE_SECONDS));
  // Also clean up any legacy oversized cookies left over from previous versions.
  res.cookies.set(LEGACY_SESSION_COOKIE, "", cookieAttrs(0));
  for (let i = 0; i < 10; i++) {
    res.cookies.set(`${LEGACY_SESSION_CHUNK_PREFIX}${i}`, "", cookieAttrs(0));
  }
}

export function clearSessionIdCookieOnResponse(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", cookieAttrs(0));
}

// ---------------------------------------------------------------------------
// State cookie — random nonce echoed through the OAuth round-trip.
// ---------------------------------------------------------------------------

export function buildStateNonce(): string {
  return randomBytes(24).toString("base64url");
}

export function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function writeStateCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(STATE_COOKIE, token, cookieAttrs(STATE_MAX_AGE_SECONDS));
}

export async function readStateCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(STATE_COOKIE)?.value ?? null;
}

export async function clearStateCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(STATE_COOKIE, "", cookieAttrs(0));
}

export function setStateCookieOnResponse(res: NextResponse, value: string): void {
  res.cookies.set(STATE_COOKIE, value, cookieAttrs(STATE_MAX_AGE_SECONDS));
}

export function clearStateCookieOnResponse(res: NextResponse): void {
  res.cookies.set(STATE_COOKIE, "", cookieAttrs(0));
}

export { SESSION_COOKIE, STATE_COOKIE };

// ---------------------------------------------------------------------------
// Compatibility wrappers — older callers expected writeSessionCookie / etc.
// We keep the public surface but route through the new store. JiraSession is
// the in-memory shape callers use; the store handles persistence + encryption.
// ---------------------------------------------------------------------------

import {
  createStoredSession,
  deleteStoredSession,
  getStoredSession,
  updateStoredSession,
} from "./session-store";

export type JiraSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  accountId: string;
  email?: string;
};

export async function writeSessionCookie(session: JiraSession): Promise<void> {
  const existingId = await readSessionIdCookie();
  if (existingId && (await getStoredSession(existingId))) {
    await updateStoredSession(existingId, session);
    return;
  }
  const id = await createStoredSession(session);
  await writeSessionIdCookie(id);
}

export async function readSessionCookie(): Promise<JiraSession | null> {
  const id = await readSessionIdCookie();
  if (!id) return null;
  return getStoredSession(id);
}

export async function clearSessionCookie(): Promise<void> {
  const id = await readSessionIdCookie();
  if (id) await deleteStoredSession(id);
  await clearSessionIdCookie();
}

export async function setSessionOnResponse(
  res: NextResponse,
  session: JiraSession,
): Promise<void> {
  const existingId = await readSessionIdCookie();
  if (existingId && (await getStoredSession(existingId))) {
    await updateStoredSession(existingId, session);
    setSessionIdCookieOnResponse(res, existingId);
    return;
  }
  const id = await createStoredSession(session);
  setSessionIdCookieOnResponse(res, id);
}

// Aliases retained for callers that imported the old names.
export const setSessionCookieOnResponse = setSessionOnResponse;
export const clearSessionCookieOnResponse = clearSessionIdCookieOnResponse;
