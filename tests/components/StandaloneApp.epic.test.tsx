import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StandaloneApp } from "@/components/StandaloneApp";

const session = { configured: true, connected: true } as never;

// Deterministic /api/knead: round 1 questions, then complete.
function mockKneadFetch() {
  let calls = 0;
  return vi.fn(async (url: string) => {
    if (typeof url === "string" && url.includes("/api/jira/session")) {
      return { ok: true, json: async () => session } as unknown as Response;
    }
    if (typeof url === "string" && url.includes("/api/knead")) {
      calls += 1;
      const body =
        calls === 1
          ? { kind: "questions", round: { questions: [
              { id: "a", prompt: "Risk?", section: "technical", type: "single", options: ["Low", "High"] },
            ] } }
          : { kind: "complete" };
      return { ok: true, json: async () => body } as unknown as Response;
    }
    return { ok: true, json: async () => ({}) } as unknown as Response;
  });
}

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
  window.localStorage.setItem(
    "task-creator:draft:standalone",
    JSON.stringify({ title: "Onboarding", description: "<p>Build a wizard</p>", mode: "epic",
      acceptanceCriteria: [], constraints: "", taskType: "epic" }),
  );
});
afterEach(() => vi.restoreAllMocks());

describe("StandaloneApp — epic mode", () => {
  it("kneads a round, answers it, and reaches Kneading complete", async () => {
    vi.stubGlobal("fetch", mockKneadFetch());
    render(<StandaloneApp initialSession={session} />);

    const kneadTasks = await screen.findByRole("button", { name: /knead tasks/i });
    await waitFor(() => expect(kneadTasks).not.toBeDisabled());
    await userEvent.click(kneadTasks);

    expect(await screen.findByText("Risk?")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "High" }));
    await userEvent.click(screen.getByRole("button", { name: /^knead$/i }));

    expect(await screen.findByText(/kneading complete/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate sub-tasks/i })).toBeDisabled();
  });

  it("switching to Single task restores the Finalize button", async () => {
    vi.stubGlobal("fetch", mockKneadFetch());
    render(<StandaloneApp initialSession={session} />);
    await userEvent.click(await screen.findByRole("tab", { name: /single task/i }));
    expect(await screen.findByRole("button", { name: /finalize task/i })).toBeInTheDocument();
  });
});
