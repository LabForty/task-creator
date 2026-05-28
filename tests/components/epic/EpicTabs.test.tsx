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
  tasks, active: "a", refreshKey: 0,
  onSelect: vi.fn(), onAdd: vi.fn(), onAnalyzeAll: vi.fn(), onAnalyzeTask: vi.fn(),
  onBake: vi.fn(), onBack: vi.fn(),
  onTitleChange: vi.fn(), onSetLabels: vi.fn(), onAddLink: vi.fn(), onRemoveLink: vi.fn(),
  onDelete: vi.fn(), onClearTask: vi.fn(),
};

describe("<EpicTabs>", () => {
  it("shows the task editor for the active task and the Analyze all + Bake toolbar", () => {
    render(<EpicTabs {...base} />);
    expect(screen.getByRole("tab", { name: /alpha/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/task title/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^analyze all$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^bake$/i })).toBeInTheDocument();
  });
  it("shows the epic Editor on the Epic tab", () => {
    render(<EpicTabs {...base} active="epic" />);
    expect(screen.getByLabelText(/task title/i)).toBeInTheDocument();
  });
  it("fires Analyze all and Bake", async () => {
    const onAnalyzeAll = vi.fn(); const onBake = vi.fn();
    render(<EpicTabs {...base} onAnalyzeAll={onAnalyzeAll} onBake={onBake} />);
    await userEvent.click(screen.getByRole("button", { name: /^analyze all$/i }));
    expect(onAnalyzeAll).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /^bake$/i }));
    expect(onBake).toHaveBeenCalled();
  });

  it("Analyze all fires onAnalyzeAll (walk starter)", async () => {
    const onAnalyzeAll = vi.fn();
    render(
      <EpicTabs
        tasks={[{ id: "t1", title: "T1", labels: [], blocks: [], blockedBy: [] }]}
        active="t1"
        refreshKey={0}
        onSelect={() => {}}
        onAdd={() => {}}
        onAnalyzeAll={onAnalyzeAll}
        onAnalyzeTask={() => {}}
        onBake={() => {}}
        onBack={() => {}}
        onTitleChange={() => {}}
        onSetLabels={() => {}}
        onAddLink={() => {}}
        onRemoveLink={() => {}}
        onDelete={() => {}}
        onClearTask={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /^analyze all$/i }));
    expect(onAnalyzeAll).toHaveBeenCalledTimes(1);
  });

  it("Back to kneading fires onBack after confirm", async () => {
    const onBack = vi.fn();
    render(
      <EpicTabs
        tasks={[{ id: "t1", title: "T1", labels: [], blocks: [], blockedBy: [] }]}
        active="t1"
        refreshKey={0}
        onSelect={() => {}}
        onAdd={() => {}}
        onAnalyzeAll={() => {}}
        onAnalyzeTask={() => {}}
        onBake={() => {}}
        onBack={onBack}
        onTitleChange={() => {}}
        onSetLabels={() => {}}
        onAddLink={() => {}}
        onRemoveLink={() => {}}
        onDelete={() => {}}
        onClearTask={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /back to kneading/i }));
    await userEvent.click(screen.getByRole("button", { name: /^yes$/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("active sub-task tab forwards onClearTask + onAnalyzeTask with the right id", async () => {
    const onAnalyzeTask = vi.fn();
    render(
      <EpicTabs
        tasks={[{ id: "t1", title: "T1", labels: [], blocks: [], blockedBy: [] }]}
        active="t1"
        refreshKey={0}
        onSelect={() => {}}
        onAdd={() => {}}
        onAnalyzeAll={() => {}}
        onAnalyzeTask={onAnalyzeTask}
        onBake={() => {}}
        onBack={() => {}}
        onTitleChange={() => {}}
        onSetLabels={() => {}}
        onAddLink={() => {}}
        onRemoveLink={() => {}}
        onDelete={() => {}}
        onClearTask={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /analyze this task/i }));
    expect(onAnalyzeTask).toHaveBeenCalledWith("t1");
  });
});
