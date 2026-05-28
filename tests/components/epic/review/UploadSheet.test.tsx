import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UploadSheet } from "@/components/epic/review/UploadSheet";
import type { UploadTask } from "@/lib/upload/types";
import { EMPTY_DRAFT } from "@/lib/draft/autosave";

const tasks: UploadTask[] = [
  { id: "a", draft: { ...EMPTY_DRAFT, title: "Alpha" }, labels: [] },
];
const denied: { id: string; title: string }[] = [];

beforeEach(() => {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("/api/jira/resources")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ resources: [{ id: "cid", name: "Acme", url: "https://acme" }] }),
      });
    }
    if (typeof url === "string" && url.includes("/api/jira/projects")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ projects: [{ id: "p1", key: "AI", name: "AI Dept", avatarUrl: null }] }),
      });
    }
    if (typeof url === "string" && url.includes("/api/jira/issue-types")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ issueTypes: [{ id: "10001", name: "Story", iconUrl: null, description: null }] }),
      });
    }
    return Promise.reject(new Error(`unexpected ${url}`));
  }) as unknown as typeof fetch;
});
afterEach(() => { vi.restoreAllMocks(); });

// Bridge: mock subscribeToJob so the orchestrator's SSE call resolves.
// Using `vi.mock` (not an alias like `vi2.mock`) so Vitest's transformer hoists it.
vi.mock("@/lib/sse/client", () => ({
  subscribeToJob: (_jobId: string, onEvent: (e: { type: string; [k: string]: unknown }) => void) => {
    queueMicrotask(() => onEvent({ type: "finalized", payload: { story: { title: "S", markdown: "" }, markdown: "" } }));
    return () => {};
  },
}));

describe("<UploadSheet> destination phase", () => {
  it("renders the destination form and a disabled Start upload until pickers are filled", async () => {
    render(
      <UploadSheet
        tasks={tasks}
        denied={denied}
        onCancel={() => {}}
        onPersistUploaded={() => {}}
      />,
    );
    expect(await screen.findByRole("heading", { name: /upload to jira/i })).toBeInTheDocument();
    // After resources auto-load, the single site auto-selects; user picks project + type.
    const start = await screen.findByRole("button", { name: /^start upload$/i });
    expect(start).toBeDisabled();
  });

  it("Cancel button fires onCancel", async () => {
    const onCancel = vi.fn();
    render(
      <UploadSheet
        tasks={tasks}
        denied={denied}
        onCancel={onCancel}
        onPersistUploaded={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("<UploadSheet> running + results phases", () => {
  beforeEach(() => {
    let exportCount = 0;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/api/jira/resources")) {
        return Promise.resolve({ ok: true, json: async () => ({ resources: [{ id: "cid", name: "Acme", url: "x" }] }) });
      }
      if (typeof url === "string" && url.includes("/api/jira/projects")) {
        return Promise.resolve({ ok: true, json: async () => ({ projects: [{ id: "p1", key: "AI", name: "AI", avatarUrl: null }] }) });
      }
      if (typeof url === "string" && url.includes("/api/jira/issue-types")) {
        return Promise.resolve({ ok: true, json: async () => ({ issueTypes: [{ id: "10001", name: "Story", iconUrl: null, description: null }] }) });
      }
      if (typeof url === "string" && url.includes("/api/finalize")) {
        return Promise.resolve({ ok: true, json: async () => ({ jobId: "job-1" }) });
      }
      if (typeof url === "string" && url.includes("/api/jira/export")) {
        exportCount += 1;
        return Promise.resolve({ ok: true, json: async () => ({ key: `AI-${exportCount}`, url: `https://x/AI-${exportCount}` }) });
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    }) as unknown as typeof fetch;
  });

  it("runs the orchestrator and shows uploaded keys in results", async () => {
    const onPersistUploaded = vi.fn();
    render(
      <UploadSheet
        tasks={[
          { id: "a", draft: { ...EMPTY_DRAFT, title: "Alpha" }, labels: [] },
          { id: "b", draft: { ...EMPTY_DRAFT, title: "Bravo" }, labels: [] },
        ]}
        denied={[]}
        onCancel={() => {}}
        onPersistUploaded={onPersistUploaded}
      />,
    );

    // Wait for site → auto-select; pick project + issue type.
    await screen.findByRole("option", { name: /AI Dept|AI \(AI\)|AI/i }); // project loaded
    const selects = screen.getAllByRole("combobox");
    // Pick AI in the project select (2nd select).
    await userEvent.selectOptions(selects[1], "AI");
    // Pick Story in the issue type select (3rd).
    await screen.findByRole("option", { name: /story/i });
    const selectsAfter = screen.getAllByRole("combobox");
    await userEvent.selectOptions(selectsAfter[2], "10001");

    await userEvent.click(screen.getByRole("button", { name: /^start upload$/i }));

    // Eventually lands in results phase with the two uploaded keys.
    expect(await screen.findByRole("heading", { name: /^results$/i })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /AI-1/ })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /AI-2/ })).toBeInTheDocument();
    expect(onPersistUploaded).toHaveBeenCalledTimes(2);
    expect(onPersistUploaded).toHaveBeenCalledWith("a", "AI-1", "https://x/AI-1");
    expect(onPersistUploaded).toHaveBeenCalledWith("b", "AI-2", "https://x/AI-2");
  });
});
