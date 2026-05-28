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
