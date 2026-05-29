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
    expect(screen.getByRole("button", { name: /generate sub-tasks/i })).not.toBeDisabled();
  });

  it("switching to Single task restores the Finalize button", async () => {
    vi.stubGlobal("fetch", mockKneadFetch());
    render(<StandaloneApp initialSession={session} />);
    await userEvent.click(await screen.findByRole("tab", { name: /single task/i }));
    expect(await screen.findByRole("button", { name: /finalize task/i })).toBeInTheDocument();
  });

  it("preserves knead state and mode when a left-pane field is edited mid-interview", async () => {
    vi.stubGlobal("fetch", mockKneadFetch());
    render(<StandaloneApp initialSession={session} />);

    // Start a round and answer it (do not complete).
    await userEvent.click(await screen.findByRole("button", { name: /knead tasks/i }));
    await userEvent.click(await screen.findByRole("radio", { name: "High" }));

    // Edit a LEFT-PANE field that is NOT the description (the title).
    const title = screen.getByLabelText(/task title/i);
    await userEvent.type(title, " v2");

    // Editor autosave must not have clobbered the parent-owned mode/knead.
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem("task-creator:draft:standalone") || "{}");
      expect(stored.mode).toBe("epic");
      expect(stored.knead?.rounds?.length).toBeGreaterThanOrEqual(1);
      expect(stored.knead.rounds[0].answers).toEqual({ a: "High" });
    });
  });

  function mockEpicFetch() {
    let kneadCalls = 0;
    return vi.fn(async (url: string) => {
      if (typeof url === "string" && url.includes("/api/jira/session")) return { ok: true, json: async () => session } as unknown as Response;
      if (typeof url === "string" && url.includes("/api/knead")) {
        kneadCalls += 1;
        const body = kneadCalls === 1
          ? { kind: "questions", round: { questions: [{ id: "a", prompt: "Risk?", section: "technical", type: "single", options: ["Low", "High"] }] } }
          : { kind: "complete" };
        return { ok: true, json: async () => body } as unknown as Response;
      }
      if (typeof url === "string" && url.includes("/api/subtasks")) {
        return { ok: true, json: async () => ({ subtasks: [
          { title: "First", description: "d", labels: ["x"], blocks: [1] },
          { title: "Second", description: "", labels: [], blocks: [] },
        ] }) } as unknown as Response;
      }
      return { ok: true, json: async () => ({}) } as unknown as Response;
    });
  }

  it("generates sub-tasks after kneading completes and persists them", async () => {
    vi.stubGlobal("fetch", mockEpicFetch());
    render(<StandaloneApp initialSession={session} />);

    await userEvent.click(await screen.findByRole("button", { name: /knead tasks/i }));
    await userEvent.click(await screen.findByRole("radio", { name: "High" }));
    await userEvent.click(screen.getByRole("button", { name: /^knead$/i }));

    await userEvent.click(await screen.findByRole("button", { name: /generate sub-tasks/i }));
    // First task tab active → its Editor title field shows the seeded title.
    expect(await screen.findByDisplayValue("First")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /second/i })).toBeInTheDocument();
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem("task-creator:draft:standalone") || "{}");
      expect(stored.epicTasks?.length).toBe(2);
      const firstId = stored.epicTasks[0].id;
      const taskDraft = JSON.parse(localStorage.getItem(`task-creator:draft:standalone:epic:${firstId}`) || "{}");
      expect(taskDraft.title).toBe("First");
    });
  });

  function mockReviewFetch() {
    let kneadCalls = 0;
    return vi.fn(async (url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.includes("/api/jira/session")) return { ok: true, json: async () => session } as unknown as Response;
      if (typeof url === "string" && url.includes("/api/knead")) {
        kneadCalls += 1;
        const body = kneadCalls === 1
          ? { kind: "questions", round: { questions: [{ id: "a", prompt: "Risk?", section: "technical", type: "single", options: ["Low", "High"] }] } }
          : { kind: "complete" };
        return { ok: true, json: async () => body } as unknown as Response;
      }
      if (typeof url === "string" && url.includes("/api/subtasks")) {
        return { ok: true, json: async () => ({ subtasks: [
          { title: "First", description: "d", labels: [], blocks: [] },
          { title: "Second", description: "", labels: [], blocks: [] },
        ] }) } as unknown as Response;
      }
      if (typeof url === "string" && url.includes("/api/interference")) {
        const reqBody = JSON.parse(String(init?.body ?? "{}"));
        const editedId = reqBody.editedSubtask?.id;
        const other = (reqBody.allSubtasks ?? []).find((s: { id: string }) => s.id !== editedId);
        return { ok: true, json: async () => ({ interference: other ? [{ affectedTaskId: other.id, sourceTaskId: editedId, reason: "shares scope" }] : [] }) } as unknown as Response;
      }
      if (typeof url === "string" && url.includes("/api/refine")) {
        const b = JSON.parse(String(init?.body ?? "{}"));
        return { ok: true, json: async () => ({ title: `${b.draft?.title ?? "Task"} refined`, description: "Refined.", acceptanceCriteria: ["AC1", "AC2"] }) } as unknown as Response;
      }
      return { ok: true, json: async () => ({}) } as unknown as Response;
    });
  }

  // Reviewer mode + per-task review state were removed in AI-36 Phase A.
  // Phase C will reintroduce the Bake flow atop the new Bake view; this test
  // will be rewritten against that surface.
  it.skip("bakes into reviewer mode, sets a status, and persists reviews", async () => {});

  // Task 9 replaced the silent batch /api/refine flow with a sequential walk
  // state machine; Analyze-all now opens the walk UI instead of calling
  // /api/refine for each task. Task 11 will rewrite this test against the
  // new walk handlers (asserts on analyzeTaskId / walking).
  it.skip("Analyze all refines every task's draft sequentially", async () => {
    vi.stubGlobal("fetch", mockReviewFetch());
    render(<StandaloneApp initialSession={session} />);
    await userEvent.click(await screen.findByRole("button", { name: /knead tasks/i }));
    await userEvent.click(await screen.findByRole("radio", { name: "High" }));
    await userEvent.click(screen.getByRole("button", { name: /^knead$/i }));
    await userEvent.click(await screen.findByRole("button", { name: /generate sub-tasks/i }));
    await screen.findByDisplayValue("First");

    await userEvent.click(screen.getByRole("button", { name: /analyze all/i }));

    await waitFor(() => {
      const std = JSON.parse(localStorage.getItem("task-creator:draft:standalone")!);
      const t0 = JSON.parse(localStorage.getItem(`task-creator:draft:standalone:epic:${std.epicTasks[0].id}`)!);
      expect(t0.acceptanceCriteria.length).toBeGreaterThan(0);
      expect(t0.title).toMatch(/refined/i);
    });
  });
});
