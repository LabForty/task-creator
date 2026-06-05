import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DraftsDashboard } from "@/components/drafts/DraftsDashboard";

const DRAFTS = [
  { id: "d1", workingTitle: "First draft", mode: "single", updatedAt: "2026-06-03T12:00:00Z", preview: "one" },
  { id: "d2", workingTitle: "Second draft", mode: "single", updatedAt: "2026-06-03T12:00:00Z", preview: "two" },
];

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

function jsonResponse(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

describe("DraftsDashboard", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads and renders drafts", async () => {
    mockFetch(() => jsonResponse({ drafts: DRAFTS }));
    render(<DraftsDashboard />);
    expect(await screen.findByText("First draft")).toBeInTheDocument();
    expect(screen.getByText("Second draft")).toBeInTheDocument();
  });

  it("delete flow: confirm popover → DELETE request → card removed without a refetch", async () => {
    const calls: Array<{ url: string; method?: string }> = [];
    mockFetch((url, init) => {
      calls.push({ url: String(url), method: init?.method });
      if (init?.method === "DELETE") return jsonResponse({}, 200);
      return jsonResponse({ drafts: DRAFTS });
    });
    render(<DraftsDashboard />);
    await screen.findByText("First draft");

    // Delete the first card via its confirm popover.
    await userEvent.click(screen.getAllByRole("button", { name: /delete/i })[0]);
    const dialog = screen.getByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.queryByText("First draft")).not.toBeInTheDocument());
    expect(screen.getByText("Second draft")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "DELETE" && c.url.includes("/api/drafts/d1"))).toBe(true);
    // No second GET — state is filtered locally so the exit animation plays.
    expect(calls.filter((c) => c.method === undefined || c.method === "GET")).toHaveLength(1);
  });

  it("keeps the card and shows an error when delete fails", async () => {
    mockFetch((url, init) => {
      if (init?.method === "DELETE") return jsonResponse({}, 500);
      return jsonResponse({ drafts: DRAFTS });
    });
    render(<DraftsDashboard />);
    await screen.findByText("First draft");
    await userEvent.click(screen.getAllByRole("button", { name: /delete/i })[0]);
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't delete/i);
  });

  it("shows the empty state after deleting the last draft", async () => {
    mockFetch((url, init) => {
      if (init?.method === "DELETE") return jsonResponse({}, 200);
      return jsonResponse({ drafts: [DRAFTS[0]] });
    });
    render(<DraftsDashboard />);
    await screen.findByText("First draft");
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText(/no drafts yet/i)).toBeInTheDocument();
  });
});
