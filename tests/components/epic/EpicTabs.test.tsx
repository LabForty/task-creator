import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EpicTabs } from "@/components/epic/EpicTabs";
import type { EpicTask } from "@/lib/epic/tasks";

beforeEach(() => window.localStorage.clear());

const tasks: EpicTask[] = [
  { id: "a", title: "Alpha", labels: [], blocks: [], blockedBy: [] },
  { id: "b", title: "Beta", labels: [], blocks: [], blockedBy: [] },
];
const base = {
  tasks, active: "a", analyzing: false, analyzeProgress: null as string | null, refreshKey: 0,
  onSelect: vi.fn(), onAdd: vi.fn(), onAnalyzeAll: vi.fn(), onBake: vi.fn(),
  onTitleChange: vi.fn(), onSetLabels: vi.fn(), onAddLink: vi.fn(), onRemoveLink: vi.fn(), onDelete: vi.fn(),
};

describe("<EpicTabs>", () => {
  it("shows the task editor for the active task and the Analyze all + Bake toolbar", () => {
    render(<EpicTabs {...base} />);
    expect(screen.getByRole("tab", { name: /alpha/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/task title/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /analyze all/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^bake$/i })).toBeInTheDocument();
  });
  it("shows the epic Editor on the Epic tab", () => {
    render(<EpicTabs {...base} active="epic" />);
    expect(screen.getByLabelText(/task title/i)).toBeInTheDocument();
  });
  it("fires Analyze all and Bake", async () => {
    const onAnalyzeAll = vi.fn(); const onBake = vi.fn();
    render(<EpicTabs {...base} onAnalyzeAll={onAnalyzeAll} onBake={onBake} />);
    await userEvent.click(screen.getByRole("button", { name: /analyze all/i }));
    expect(onAnalyzeAll).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /^bake$/i }));
    expect(onBake).toHaveBeenCalled();
  });
  it("shows analyze progress and disables the button while analyzing", () => {
    render(<EpicTabs {...base} analyzing analyzeProgress="Analyzing 1/2…" />);
    expect(screen.getByText(/analyzing 1\/2/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /analyz/i })).toBeDisabled();
  });
});
