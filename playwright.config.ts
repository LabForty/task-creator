import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      TASK_AGENT_MODE: "stub",
      // Stub mode bypasses real Claude; provide a sentinel so the SDK isn't
      // tempted to auto-prompt for OAuth during dev.
      CLAUDE_CODE_OAUTH_TOKEN: "stub",
      // Enables the /api/test/install-session escape hatch so specs can drop
      // a synthetic Jira session cookie and skip the real OAuth round-trip.
      E2E_TEST_AUTH: "1",
    },
  },
});
