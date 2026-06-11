import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { StandaloneApp } from "@/components/StandaloneApp";
import { EMPTY_DRAFT } from "@/lib/draft/autosave";

// AI-50: form changes must reach the server after 1 minute of inactivity —
// not only when the user clicks "Save as draft".

type FetchCall = { url: string; method: string; body?: string };

describe("<StandaloneApp> idle auto-save", () => {
  const calls: FetchCall[] = [];

  beforeEach(() => {
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
    calls.length = 0;
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown, init?: RequestInit) => {
        calls.push({
          url: String(url),
          method: init?.method ?? "GET",
          body: typeof init?.body === "string" ? init.body : undefined,
        });
        if (String(url).includes("/api/jira/session")) {
          return { ok: true, json: async () => ({ configured: true, connected: true }) } as unknown as Response;
        }
        if (String(url).includes("/api/drafts") && init?.method === "POST") {
          return { ok: true, status: 201, json: async () => ({ id: "d-auto" }) } as unknown as Response;
        }
        // Simulates a binding to a draft that was deleted server-side.
        if (String(url).includes("/api/drafts/d-gone") && init?.method === "PATCH") {
          return { ok: false, status: 404, json: async () => ({ error: "not_found" }) } as unknown as Response;
        }
        return { ok: true, json: async () => ({}) } as unknown as Response;
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("persists a dirty draft to the server after 60s of inactivity", async () => {
    render(<StandaloneApp initialSession={{ configured: true, connected: true, email: "a@b.co", accountId: "acct-A" }} />);

    const title = screen.getByPlaceholderText("e.g. Export users as CSV");
    fireEvent.change(title, { target: { value: "Idle title" } });

    // No save while the user is still within the idle window.
    expect(calls.some((c) => c.url.includes("/api/drafts") && c.method === "POST")).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    const save = calls.find((c) => c.url.endsWith("/api/drafts") && c.method === "POST");
    expect(save).toBeDefined();
    expect(save!.body).toContain("Idle title");
    // The server id is remembered locally so the NEXT visit updates in place.
    expect(window.localStorage.getItem("task-creator:draft-id:standalone")).toBe("d-auto");
  });

  it("reuses the stored server id after a reload: PATCH in place, never a duplicate POST", async () => {
    window.localStorage.setItem(
      "task-creator:draft:standalone",
      JSON.stringify({ ...EMPTY_DRAFT, title: "Restored", description: "<p>hi</p>" }),
    );
    window.localStorage.setItem("task-creator:draft-id:standalone", "d-stored");
    render(<StandaloneApp initialSession={{ configured: true, connected: true, email: "a@b.co", accountId: "acct-A" }} />);

    screen.getByDisplayValue("Restored");
    fireEvent.change(screen.getByPlaceholderText("e.g. Export users as CSV"), {
      target: { value: "Restored v2" },
    });
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    const patch = calls.find((c) => c.url.endsWith("/api/drafts/d-stored") && c.method === "PATCH");
    expect(patch).toBeDefined();
    expect(patch!.body).toContain("Restored v2");
    expect(calls.some((c) => c.url.endsWith("/api/drafts") && c.method === "POST")).toBe(false);
  });

  it("falls back to POST and adopts the new id when the bound draft was deleted server-side", async () => {
    window.localStorage.setItem(
      "task-creator:draft:standalone",
      JSON.stringify({ ...EMPTY_DRAFT, title: "Orphaned", description: "<p>hi</p>" }),
    );
    window.localStorage.setItem("task-creator:draft-id:standalone", "d-gone");
    render(<StandaloneApp initialSession={{ configured: true, connected: true, email: "a@b.co", accountId: "acct-A" }} />);

    screen.getByDisplayValue("Orphaned");
    fireEvent.change(screen.getByPlaceholderText("e.g. Export users as CSV"), {
      target: { value: "Orphaned v2" },
    });
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    expect(calls.some((c) => c.url.endsWith("/api/drafts/d-gone") && c.method === "PATCH")).toBe(true);
    const post = calls.find((c) => c.url.endsWith("/api/drafts") && c.method === "POST");
    expect(post).toBeDefined();
    expect(post!.body).toContain("Orphaned v2");
    expect(window.localStorage.getItem("task-creator:draft-id:standalone")).toBe("d-auto");
  });

  it("does not auto-save when nothing was changed", async () => {
    render(<StandaloneApp initialSession={{ configured: true, connected: true, email: "a@b.co", accountId: "acct-A" }} />);
    await act(async () => {
      vi.advanceTimersByTime(180_000);
    });
    expect(calls.some((c) => c.url.includes("/api/drafts"))).toBe(false);
  });
});
