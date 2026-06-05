import { test, expect } from "@playwright/test";
import { installJiraSession } from "./session";

/**
 * E2E smoke for the drafts feature (AI-33).
 *
 * The app is auth-gated (lib/auth/requireSession), so these shell tests
 * authenticate via the synthetic-session escape hatch (installJiraSession →
 * /api/test/install-session, enabled by E2E_TEST_AUTH=1) before navigating.
 *
 * Scope is intentionally limited to server-rendered structure, mirroring
 * `finalize.spec.ts`. The full happy path (type a title → Save as draft →
 * see it on /drafts → reopen → finalize → removed) is NOT automated here for
 * two reasons:
 *
 *   1. The same React-19 + Playwright controlled-input quirk documented in
 *      finalize.spec.ts: Playwright's typed value lands in the DOM but the
 *      input's onChange never fires, so `draft.title` stays empty and the
 *      Save/Finalize buttons can't be exercised. Until that focused fix
 *      lands, typing-driven flows are covered by real-user testing in dev.
 *   2. The drafts list + persistence require live Supabase credentials
 *      (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). The dashboard SHELL
 *      (heading, nav) renders regardless; only the list body needs the DB.
 *
 * The save/open/finalize logic itself is covered by unit + route tests:
 * tests/lib/drafts/*, tests/api/drafts/*, tests/components/drafts/*,
 * tests/components/Editor.savedraft.test.tsx.
 */
test.describe("drafts navigation + dashboard shell render", () => {
  test("GET / exposes a Drafts link to the dashboard", async ({ page }) => {
    await installJiraSession(page);
    await page.goto("/");
    const draftsLink = page.getByRole("link", { name: /^drafts$/i });
    await expect(draftsLink).toBeVisible();
    await expect(draftsLink).toHaveAttribute("href", "/drafts");
  });

  test("GET /drafts renders the dashboard shell (heading + back link)", async ({ page }) => {
    await installJiraSession(page);
    await page.goto("/drafts");
    await expect(page.getByRole("heading", { name: /your drafts/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /back to creator/i })).toHaveAttribute("href", "/");
  });
});
