import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

  it("Back to editor from kneading clears knead state and hides the panel", async () => {
    window.localStorage.setItem(
      "task-creator:draft:standalone",
      JSON.stringify({
        ...EMPTY_DRAFT,
        mode: "epic",
        description: "<p>An epic</p>",
        knead: {
          status: "interviewing",
          rounds: [{
            questions: [{ id: "q-a", prompt: "?", section: "business", type: "text" }],
            answers: {},
            skipped: [],
          }],
          sourceDescription: "An epic",
        },
      }),
    );
    render(<StandaloneApp initialSession={{ configured: false, connected: false }} />);

    await screen.findByRole("button", { name: /back to editor/i });
    await userEvent.click(screen.getByRole("button", { name: /back to editor/i }));
    await userEvent.click(screen.getByRole("button", { name: /^yes$/i }));

    expect(screen.queryByRole("button", { name: /back to editor/i })).toBeNull();
    const stored = JSON.parse(window.localStorage.getItem("task-creator:draft:standalone")!);
    expect(stored.knead.status).toBe("idle");
    expect(stored.knead.rounds).toEqual([]);
  });

  it("drops stale persisted knead rounds when a cleared epic draft is reopened", async () => {
    window.localStorage.setItem(
      "task-creator:draft:standalone",
      JSON.stringify({
        ...EMPTY_DRAFT,
        mode: "epic",
        taskType: "epic",
        knead: {
          status: "interviewing",
          rounds: [{
            questions: [{ id: "old-q", prompt: "Old refinement question?", section: "business", type: "text" }],
            answers: {},
            skipped: [],
          }],
          sourceDescription: "Old epic text",
        },
      }),
    );

    render(<StandaloneApp initialSession={{ configured: false, connected: false }} />);

    await waitFor(() => {
      expect(screen.queryByText("Old refinement question?")).not.toBeInTheDocument();
      const stored = JSON.parse(window.localStorage.getItem("task-creator:draft:standalone")!);
      expect(stored.knead).toEqual({ status: "idle", rounds: [] });
    });
    expect(screen.queryByRole("button", { name: /back to editor/i })).toBeNull();
  });
});

// Mock MermaidDiagram + subscribeToJob so the reviewer renders cleanly in jsdom.
vi.mock("@/components/MermaidDiagram", () => ({
  MermaidDiagram: ({ source }: { source: string }) => <pre data-testid="md-source">{source}</pre>,
}));
vi.mock("@/lib/sse/client", () => ({
  subscribeToJob: () => () => {},
}));

// Phase C will rewrite this against the new Bake view + Upload all path.
it.skip("clicking Finalize opens the UploadSheet when every task is reviewed", async () => {
  // Reviewer mode + reviews state were removed in AI-36 Phase A. The Finalize
  // affordance is being re-introduced in Phase C atop the new Bake view, at
  // which point this test will be rewritten.
});
