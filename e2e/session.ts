import { type Page } from "@playwright/test";

/**
 * Test-only auth escape hatch.
 *
 * The app's server components require a live Jira session
 * (lib/auth/requireSession) and real OAuth is impossible in a Playwright
 * sandbox. POSTing to /api/test/install-session drops a synthetic session
 * cookie so subsequent navigations clear the auth gate. The route only
 * responds when E2E_TEST_AUTH=1 (set on the webServer in
 * playwright.config.ts), so it cannot be invoked in production.
 */
export async function installJiraSession(page: Page) {
  const res = await page.request.post("/api/test/install-session");
  if (!res.ok()) {
    throw new Error(
      `Test-auth escape hatch failed (${res.status()}). ` +
        `Ensure E2E_TEST_AUTH=1 is set on the webServer in playwright.config.ts.`,
    );
  }
}
