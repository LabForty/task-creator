import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EpicEditingView } from "@/components/epic/EpicEditingView";

const tasks = [
  { id: "a", title: "Alpha", labels: [], blocks: [], blockedBy: [] },
];

const baseProps = {
  epicTitle: "My Epic",
  epicDescriptionHtml: "<p>doing things</p>",
  tasks,
  activeId: "epic" as const,
  bakeStatus: "idle" as const,
  bakeProgress: {},
  bakeErrors: {},
  bakeDone: 0,
  bakeTotal: 0,
  refreshKey: 0,
  onSelectCard: () => {},
  onAdd: () => {},
  onDelete: () => {},
  onCancelBake: () => {},
  onBack: () => {},
  onAnalyzeAll: () => {},
  onBake: () => {},
  onTitleChange: () => {},
  onSetLabels: () => {},
  onAddLink: () => {},
  onRemoveLink: () => {},
  onClearTask: () => {},
};

beforeEach(() => {
  // Stub the templates fetch for the embedded Editor's TaskTypePicker.
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ templates: [] }),
  }) as unknown as typeof fetch;
});
afterEach(() => { vi.restoreAllMocks(); });

describe("<EpicEditingView>", () => {
  it("renders the toolbar with Back, Analyze all, and Bake", () => {
    render(<EpicEditingView {...baseProps} />);
    expect(screen.getByRole("button", { name: /back to kneading/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^analyze all$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^bake$/i })).toBeInTheDocument();
  });

  it("clicking the Bake button fires onBake", async () => {
    const onBake = vi.fn();
    render(<EpicEditingView {...baseProps} onBake={onBake} />);
    await userEvent.click(screen.getByRole("button", { name: /^bake$/i }));
    expect(onBake).toHaveBeenCalledTimes(1);
  });

  it("disables Bake while baking", () => {
    render(<EpicEditingView {...baseProps} bakeStatus="baking" />);
    expect(screen.getByRole("button", { name: /^bake$/i })).toBeDisabled();
  });

  it("renders the cards column with Epic + tasks", () => {
    render(<EpicEditingView {...baseProps} />);
    expect(screen.getByText("My Epic")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
  });
});
