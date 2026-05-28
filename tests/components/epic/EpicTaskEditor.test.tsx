import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EpicTaskEditor } from "@/components/epic/EpicTaskEditor";
import type { EpicTask } from "@/lib/epic/tasks";

beforeEach(() => window.localStorage.clear());

const tasks: EpicTask[] = [
  { id: "a", title: "Alpha", labels: [], blocks: [], blockedBy: [] },
  { id: "b", title: "Beta", labels: [], blocks: [], blockedBy: [] },
];
const base = {
  allTasks: tasks, labels: [], blocks: [], blockedBy: [], refreshKey: 0,
  onTitleChange: () => {}, onSetLabels: () => {}, onAddLink: () => {}, onRemoveLink: () => {}, onDelete: () => {},
  onAnalyze: () => {}, onClear: () => {},
};

describe("<EpicTaskEditor>", () => {
  it("renders the single-task editor fields without a submit button", () => {
    render(<EpicTaskEditor taskId="a" {...base} />);
    expect(screen.getByLabelText(/task title/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /finalize task|knead tasks/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });
  it("hydrates the task's persisted draft", async () => {
    window.localStorage.setItem("task-creator:draft:standalone:epic:a", JSON.stringify({ title: "Persisted A", description: "", acceptanceCriteria: [], constraints: "" }));
    render(<EpicTaskEditor taskId="a" {...base} />);
    expect(await screen.findByDisplayValue("Persisted A")).toBeInTheDocument();
  });
  it("fires onDelete", async () => {
    const onDelete = vi.fn();
    render(<EpicTaskEditor taskId="a" {...base} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(onDelete).toHaveBeenCalled();
  });
  it("offers other tasks (not itself) as link targets", () => {
    render(<EpicTaskEditor taskId="a" {...base} />);
    const select = screen.getByLabelText(/add a sub-task this blocks/i) as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).not.toContain("a");
  });
  it("renders Analyze this task and fires onAnalyze with the task id", async () => {
    const onAnalyze = vi.fn();
    render(
      <EpicTaskEditor
        taskId="t1"
        allTasks={[{ id: "t1", title: "T1", labels: [], blocks: [], blockedBy: [] }]}
        labels={[]}
        blocks={[]}
        blockedBy={[]}
        refreshKey={0}
        onTitleChange={() => {}}
        onSetLabels={() => {}}
        onAddLink={() => {}}
        onRemoveLink={() => {}}
        onDelete={() => {}}
        onAnalyze={onAnalyze}
        onClear={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /analyze this task/i }));
    expect(onAnalyze).toHaveBeenCalledWith();
  });

  it("forwards onClear into the embedded Editor footer", async () => {
    const onClear = vi.fn();
    render(
      <EpicTaskEditor
        taskId="t1"
        allTasks={[{ id: "t1", title: "T1", labels: [], blocks: [], blockedBy: [] }]}
        labels={[]}
        blocks={[]}
        blockedBy={[]}
        refreshKey={0}
        onTitleChange={() => {}}
        onSetLabels={() => {}}
        onAddLink={() => {}}
        onRemoveLink={() => {}}
        onDelete={() => {}}
        onAnalyze={() => {}}
        onClear={onClear}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /^clear$/i }));
    await userEvent.click(screen.getByRole("button", { name: /^yes$/i }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
