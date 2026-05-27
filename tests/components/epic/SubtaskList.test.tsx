import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SubtaskList } from "@/components/epic/SubtaskList";
import type { SubTask } from "@/lib/subtasks/types";

const list: SubTask[] = [
  { id: "a", title: "Alpha", description: "", labels: [], blocks: [], blockedBy: [] },
  { id: "b", title: "Beta", description: "", labels: [], blocks: [], blockedBy: [] },
];
const handlers = { onUpdate: vi.fn(), onSetLabels: vi.fn(), onAddLink: vi.fn(), onRemoveLink: vi.fn(), onDelete: vi.fn(), onAdd: vi.fn() };

describe("<SubtaskList>", () => {
  it("renders a card per sub-task", () => {
    render(<SubtaskList subtasks={list} {...handlers} />);
    expect(screen.getByDisplayValue("Alpha")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Beta")).toBeInTheDocument();
  });

  it("fires onAdd", async () => {
    const onAdd = vi.fn();
    render(<SubtaskList subtasks={list} {...handlers} onAdd={onAdd} />);
    await userEvent.click(screen.getByRole("button", { name: /add sub-task/i }));
    expect(onAdd).toHaveBeenCalled();
  });

  it("routes per-card callbacks with the sub-task id", async () => {
    const onDelete = vi.fn();
    render(<SubtaskList subtasks={list} {...handlers} onDelete={onDelete} />);
    await userEvent.click(screen.getAllByRole("button", { name: /delete sub-task/i })[1]);
    expect(onDelete).toHaveBeenCalledWith("b");
  });
});
