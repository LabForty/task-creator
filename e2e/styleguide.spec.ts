import { test, expect } from "@playwright/test";

// The styleguide is a public design reference (no auth gate). It renders the
// token swatches + primitives in light and dark, so it doubles as the visual
// regression surface for the design system.
test.describe("styleguide route", () => {
  test("GET /styleguide renders the design-system reference", async ({ page }) => {
    await page.goto("/styleguide");
    await expect(page.getByRole("heading", { name: /design system/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /buttons/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /typography/i })).toBeVisible();
    // A live primitive renders (the primary button sample).
    await expect(page.getByRole("button", { name: /primary/i }).first()).toBeVisible();
  });
});
