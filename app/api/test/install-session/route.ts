import { NextResponse } from "next/server";
import { writeSessionCookie } from "@/lib/jira";

export const runtime = "nodejs";

/**
 * E2E-only escape hatch — installs a synthetic Jira session so Playwright can
 * exercise the gated UI without going through the real OAuth round-trip.
 *
 * Guarded by E2E_TEST_AUTH=1 so it cannot be invoked in production. The
 * Playwright config sets this env var on the webServer it spawns.
 *
 * The installed session has a far-future expiry; any code path that hits the
 * real Atlassian API will still fail (which is desirable — tests mock the
 * Jira API surface with `page.route`).
 */
export async function POST() {
  if (process.env.E2E_TEST_AUTH !== "1") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  await writeSessionCookie({
    accessToken: "e2e-stub-access-token",
    refreshToken: "e2e-stub-refresh-token",
    // Far enough in the future that the refresh-leeway check in
    // getValidSession() never fires during a test run.
    expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 30,
    accountId: "e2e-test-account",
    email: "test@labforty.com",
  });
  return NextResponse.json({ ok: true });
}
