import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StandaloneApp } from "@/components/StandaloneApp";
import { EMPTY_DRAFT } from "@/lib/draft/autosave";

const session = { configured: false, connected: false } as never;

function mockFetch() {
  return vi.fn(async (url: string) => {
    if (typeof url === "string" && url.includes("/api/jira/session")) {
      return { ok: true, json: async () => session } as unknown as Response;
    }
    if (typeof url === "string" && url.includes("/api/knead")) {
      return {
        ok: true,
        json: async () => ({
          kind: "questions",
          round: {
            questions: [
              { id: "q-a", prompt: "?", section: "business", type: "text" },
            ],
          },
        }),
      } as unknown as Response;
    }
    return { ok: true, json: async () => ({}) } as unknown as Response;
  });
}

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
});
afterEach(() => vi.restoreAllMocks());

describe("<StandaloneApp> — epic Knead preserves description", () => {
  it("keeps the description in the left-pane editor visible after Knead is clicked", async () => {
    // Seed a draft directly in localStorage so the Editor hydrates with a
    // visible description. TipTap doesn't play well with userEvent.type in
    // jsdom, so seeding through storage is the most reliable way to assert
    // on the rendered description text.
    window.localStorage.setItem(
      "task-creator:draft:standalone",
      JSON.stringify({
        ...EMPTY_DRAFT,
        mode: "epic",
        taskType: "epic",
        description: "my epic description here",
      }),
    );

    vi.stubGlobal("fetch", mockFetch());
    const { container } = render(<StandaloneApp initialSession={session} />);

    // Wait for the description to be rendered by TipTap.
    await waitFor(() =>
      expect(screen.getByText(/my epic description here/i)).toBeInTheDocument(),
    );

    const kneadBtn = await screen.findByRole("button", { name: /knead tasks/i });
    await waitFor(() => expect(kneadBtn).not.toBeDisabled());

    // Snapshot the TipTap inner HTML before clicking — useful if the test
    // fails to localise where the content disappeared.
    const tiptap = () => container.querySelector(".tiptap-prose") as HTMLElement | null;
    expect(tiptap()?.innerHTML).toContain("my epic description here");

    await userEvent.click(kneadBtn);

    // Wait for the kneading round to actually land in storage (so any
    // post-click setState chain has fully settled before we assert on the
    // editor content).
    await waitFor(() => {
      const stored = JSON.parse(
        window.localStorage.getItem("task-creator:draft:standalone") || "{}",
      );
      expect(stored.knead?.rounds?.length ?? 0).toBeGreaterThanOrEqual(1);
    });

    // After click, the description text must STILL be present. getByText
    // throws if it's gone so the failure is loud.
    expect(screen.getByText(/my epic description here/i)).toBeInTheDocument();
    // And the in-DOM TipTap content must still contain it (not just an
    // off-screen label).
    expect(tiptap()?.innerHTML ?? "").toContain("my epic description here");
    // And it must still be in localStorage (i.e. not silently cleared).
    const stored = JSON.parse(
      window.localStorage.getItem("task-creator:draft:standalone") || "{}",
    );
    expect(stored.description).toMatch(/my epic description here/i);
  });
});
