import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SubtaskCard } from "@/components/epic/SubtaskCard";
import type { SubTask } from "@/lib/subtasks/types";

const st: SubTask = { id: "a", title: "Alpha", description: "desc", labels: ["x"], blocks: [], blockedBy: [] };
const base = {
  allSubtasks: [st],
  onUpdate: () => {}, onSetLabels: () => {}, onAddLink: () => {}, onRemoveLink: () => {}, onDelete: () => {},
};

describe("<SubtaskCard>", () => {
  it("reports title edits", async () => {
    const onUpdate = vi.fn();
    render(<SubtaskCard subtask={st} {...base} onUpdate={onUpdate} />);
    await userEvent.type(screen.getByLabelText(/^title/i), "!");
    expect(onUpdate).toHaveBeenLastCalledWith({ title: "Alpha!" });
  });

  it("shows a 1500-char counter and caps the description input", () => {
    render(<SubtaskCard subtask={st} {...base} />);
    const desc = screen.getByLabelText(/^description/i) as HTMLTextAreaElement;
    expect(desc.maxLength).toBe(1500);
    expect(screen.getByText(/4\s*\/\s*1500/)).toBeInTheDocument();
  });

  it("fires onDelete", async () => {
    const onDelete = vi.fn();
    render(<SubtaskCard subtask={st} {...base} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: /delete sub-task/i }));
    expect(onDelete).toHaveBeenCalled();
  });
});
