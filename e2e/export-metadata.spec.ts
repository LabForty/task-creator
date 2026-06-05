import { test, expect, type Page } from "@playwright/test";
import { installJiraSession } from "./session";

/**
 * E2E smoke: drives the Jira export flow with metadata end-to-end.
 *
 * Auth gate: the app's server components require a live Jira session
 * (lib/auth/requireSession). Real OAuth is impossible in a Playwright
 * sandbox, so we hit a test-only escape hatch at /api/test/install-session
 * that drops a synthetic session cookie. The route only responds when
 * E2E_TEST_AUTH=1 (set in playwright.config.ts) so it cannot be invoked
 * in production.
 *
 * Jira API surface: every /api/jira/* route is stubbed via page.route so
 * the test never touches a real Atlassian server. We also seed the
 * autosave draft in localStorage to dodge a known React-19 controlled-
 * input quirk that prevents typing programmatically into the editor.
 */

const SITE = { id: "c1", name: "Site", url: "https://example.atlassian.net" };
const PROJECT = { id: "1", key: "PROJ", name: "Demo", avatarUrl: null };
const ISSUE_TYPE = {
  id: "10001",
  name: "Story",
  iconUrl: null,
  description: null,
};

async function clearStaleDraft(page: Page) {
  // Ensure no stale draft from a previous run lives in localStorage (the
  // browser context is fresh per test but a previous workspace failure can
  // leave one in `.playwright-data`).
  await page.addInitScript(() => {
    try {
      window.localStorage.removeItem("task-creator:draft:standalone");
    } catch {
      /* localStorage might be disabled */
    }
  });
}

async function stubJiraRoutes(page: Page) {
  await page.route("**/api/jira/whoami", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        connected: true,
        email: "test@labforty.com",
        accountId: "e2e-test-account",
      }),
    }),
  );

  // Mock /api/jira/session too — StandaloneApp refreshes the chip from here
  // on mount and would otherwise return "not connected" because the
  // synthetic cookie maps to a session the legacy on-disk store never saw.
  await page.route("**/api/jira/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        connected: true,
        email: "test@labforty.com",
        accountId: "e2e-test-account",
      }),
    }),
  );

  await page.route("**/api/jira/resources", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ resources: [SITE] }),
    }),
  );

  await page.route("**/api/jira/projects*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ projects: [PROJECT] }),
    }),
  );

  await page.route("**/api/jira/issue-types*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ issueTypes: [ISSUE_TYPE] }),
    }),
  );

  await page.route("**/api/jira/labels*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ labels: ["backend"] }),
    }),
  );

  await page.route("**/api/jira/issue-search*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        issues: [{ key: "ABC-1", title: "Add export" }],
      }),
    }),
  );

  await page.route("**/api/jira/link-types*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        linkTypes: [
          {
            id: "10000",
            name: "Relates",
            inward: "relates to",
            outward: "relates to",
          },
        ],
      }),
    }),
  );

  await page.route("**/api/jira/epics*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        epics: [{ key: "EPIC-9", title: "Auth rework" }],
      }),
    }),
  );

  await page.route("**/api/jira/export", (route) => {
    if (route.request().method() !== "POST") {
      return route.continue();
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        key: "PROJ-100",
        url: "https://example.atlassian.net/browse/PROJ-100",
        attachments: {},
        attachmentErrors: {},
        autoFilledFields: [],
        missingRequiredFields: [],
        linkResults: { ok: ["ABC-1"], failed: [] },
        flagCommentResult: "ok",
      }),
    });
  });
}

test.describe("export metadata smoke", () => {
  test("drafts a story, exports to Jira with a label, and lands on the success view", async ({
    page,
  }) => {
    await installJiraSession(page);
    await clearStaleDraft(page);
    await stubJiraRoutes(page);

    await page.goto("/");
    // Wait for StandaloneApp to install its e2e hook on window.
    await page.waitForFunction(
      () =>
        typeof (window as unknown as { __E2E_SET_MODE__?: unknown })
          .__E2E_SET_MODE__ === "function",
      undefined,
      { timeout: 15_000 },
    );

    // Short-circuit the Editor → Finalize → SSE pipeline. React 19's
    // controlled-input tracker prevents Playwright from feeding a title into
    // the Editor reliably (documented in e2e/finalize.spec.ts). Instead we
    // jump straight to the Preview state with a synthetic finalized payload
    // via the e2e-only escape hatch baked into StandaloneApp. The metadata
    // export flow — which is what this smoke test exercises — starts from
    // exactly this state in real usage.
    await page.evaluate(() => {
      type Detail = {
        payload: unknown;
        lastDraft: unknown;
        diagrams?: unknown;
      };
      const win = window as unknown as {
        __E2E_SET_MODE__?: (d: Detail) => void;
      };
      const payload = {
        requirement: {
          title: "Add CSV export",
          summary: "Users need to download their data as CSV.",
          problem: "Manual data export is slow.",
          value: "Faster ad-hoc analysis.",
          acceptanceCriteria: [
            "GIVEN a user WHEN they click Export THEN a CSV downloads",
          ],
          outOfScope: [],
          dependencies: [],
          risks: [],
        },
        story: {
          title: "Add CSV export",
          markdown: "# Add CSV export\n\nDownload data as CSV.",
        },
        gates: {
          schema: { gate: "schema", ok: true },
          consistency: { gate: "consistency", ok: true },
        },
        markdown: "# Add CSV export\n\nDownload data as CSV.",
        downloadUrls: {
          requirement: "/api/jobs/test/download/requirement",
          story: "/api/jobs/test/download/story",
          markdown: "/api/jobs/test/download/markdown",
        },
      };
      const lastDraft = {
        title: "Add CSV export",
        description: "Users need to download their data as CSV.",
        acceptanceCriteria: [
          "GIVEN a user WHEN they click Export THEN a CSV downloads",
        ],
        constraints: "",
        taskType: "story",
      };
      win.__E2E_SET_MODE__?.({ payload, lastDraft });
    });

    // After the event, StandaloneApp transitions to "done" and Preview
    // renders with the Export to Jira button.
    await page.waitForTimeout(1000);
    const debug = await page.evaluate(() => ({
      hooks: (window as unknown as { __E2E_HOOKS__?: boolean }).__E2E_HOOKS__,
      text: document.body.innerText.slice(0, 400),
    }));
    console.log("DEBUG:", JSON.stringify(debug));
    const exportButton = page.getByRole("button", { name: /export to jira/i });
    await exportButton.waitFor({ state: "visible", timeout: 10_000 });
    await exportButton.click();

    // JiraExport renders. Site has length 1 so it auto-selects and the
    // project picker appears.
    await expect(page.getByRole("heading", { name: /export to jira/i })).toBeVisible();

    // One project — click it. The filter input is "Filter projects…".
    const projectRow = page.getByRole("button", { name: /demo/i });
    await projectRow.waitFor({ state: "visible" });
    await projectRow.click();

    // After the project is picked, JiraMetadata becomes visible (rendered
    // conditionally on cloudId+projectKey). The "Labels" label is the most
    // stable anchor.
    await expect(page.getByText(/^Labels$/)).toBeVisible();

    // Add a label via the combobox: type "back", the stubbed /api/jira/labels
    // returns ["backend"], click it.
    const labelsField = page.locator('[data-field="labels"]');
    const labelsInput = labelsField.getByRole("combobox");
    await labelsInput.click();
    await labelsInput.fill("back");
    const backendOption = labelsField.getByRole("button", { name: "backend" });
    await backendOption.waitFor({ state: "visible" });
    await backendOption.click();
    await expect(labelsField.getByText("backend")).toBeVisible();

    // Create the issue.
    const createIssueButton = page.getByRole("button", { name: /create issue/i });
    await expect(createIssueButton).toBeEnabled();
    await createIssueButton.click();

    // Success view shows PROJ-100.
    await expect(page.getByRole("heading", { name: /exported to jira/i })).toBeVisible();
    await expect(page.getByText("PROJ-100")).toBeVisible();
    await expect(page.getByRole("link", { name: /open in jira/i })).toHaveAttribute(
      "href",
      "https://example.atlassian.net/browse/PROJ-100",
    );
  });
});
