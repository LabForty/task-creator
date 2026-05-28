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
});

// Mock MermaidDiagram + subscribeToJob so the reviewer renders cleanly in jsdom.
vi.mock("@/components/MermaidDiagram", () => ({
  MermaidDiagram: ({ source }: { source: string }) => <pre data-testid="md-source">{source}</pre>,
}));
vi.mock("@/lib/sse/client", () => ({
  subscribeToJob: () => () => {},
}));

it("clicking Finalize opens the UploadSheet when every task is reviewed", async () => {
  // Seed an epic-mode draft with two tasks, both reviewed, in reviewer mode.
  window.localStorage.setItem(
    "task-creator:draft:standalone",
    JSON.stringify({
      ...EMPTY_DRAFT,
      mode: "epic",
      title: "Epic",
      description: "<p>epic</p>",
      epicTasks: [
        { id: "a", title: "Alpha", labels: [], blocks: [], blockedBy: [] },
        { id: "b", title: "Bravo", labels: [], blocks: [], blockedBy: [] },
      ],
      reviewing: true,
      reviews: {
        a: { status: "approved", comment: "", assignee: null },
        b: { status: "denied", comment: "", assignee: null },
      },
    }),
  );
  // Seed per-task drafts so the orchestrator has descriptions to send.
  window.localStorage.setItem(
    "task-creator:draft:standalone:epic:a",
    JSON.stringify({ ...EMPTY_DRAFT, title: "Alpha", description: "do A" }),
  );

  // Stub the Jira resources endpoints minimally — the sheet must be reachable
  // without actually starting an upload.
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("/api/jira/resources")) {
      return Promise.resolve({ ok: true, json: async () => ({ resources: [] }) });
    }
    if (typeof url === "string" && url.includes("/api/jira/session")) {
      return Promise.resolve({ ok: true, json: async () => ({ configured: false, connected: false }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  }) as unknown as typeof fetch;

  render(<StandaloneApp initialSession={{ configured: false, connected: false }} />);
  const btn = await screen.findByRole("button", { name: /^finalize$/i });
  expect(btn).not.toBeDisabled();
  await userEvent.click(btn);

  expect(await screen.findByRole("heading", { name: /upload to jira/i })).toBeInTheDocument();
});
