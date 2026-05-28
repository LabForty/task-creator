import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StandaloneApp } from "@/components/StandaloneApp";
import { EMPTY_DRAFT } from "@/lib/draft/autosave";

beforeEach(() => {
  // StandaloneApp renders ThemeToggle, which reads window.matchMedia on mount;
  // jsdom doesn't provide it. Stub a minimal implementation.
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }
  window.localStorage.clear();
  // Default fetch stub so /api/jira/session etc. resolve cleanly.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({}) }) as unknown as Response),
  );
});
afterEach(() => vi.restoreAllMocks());

describe("<StandaloneApp>", () => {
  it("Clear in single mode resets only the standalone draft", async () => {
    // Seed a non-empty draft so the Clear button's effect is observable.
    window.localStorage.setItem(
      "task-creator:draft:standalone",
      JSON.stringify({ ...EMPTY_DRAFT, title: "Keep me", description: "<p>hi</p>" }),
    );
    render(<StandaloneApp initialSession={{ configured: false, connected: false }} />);

    // Wait for the title to hydrate, then click Clear.
    await screen.findByDisplayValue("Keep me");
    await userEvent.click(screen.getByRole("button", { name: /^clear$/i }));
    await userEvent.click(screen.getByRole("button", { name: /^yes$/i }));

    // Title is cleared in the UI and in localStorage.
    expect(screen.queryByDisplayValue("Keep me")).toBeNull();
    const stored = JSON.parse(window.localStorage.getItem("task-creator:draft:standalone")!);
    expect(stored.title).toBe("");
  });
});
