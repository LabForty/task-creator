import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SubtaskLinksField } from "@/components/epic/SubtaskLinksField";
import type { SubTask } from "@/lib/subtasks/types";

const a: SubTask = { id: "a", title: "Alpha", description: "", labels: [], blocks: ["b"], blockedBy: [] };
const b: SubTask = { id: "b", title: "Beta", description: "", labels: [], blocks: [], blockedBy: ["a"] };
const c: SubTask = { id: "c", title: "Gamma", description: "", labels: [], blocks: [], blockedBy: [] };

describe("<SubtaskLinksField>", () => {
  it("lists current 'blocks' links by title", () => {
    render(<SubtaskLinksField subtask={a} allSubtasks={[a, b, c]} onAddLink={vi.fn()} onRemoveLink={vi.fn()} />);
    expect(screen.getByText(/blocks:/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove blocks Beta/i })).toBeInTheDocument();
  });

  it("adds a blocks link by selecting another sub-task", async () => {
    const onAddLink = vi.fn();
    render(<SubtaskLinksField subtask={a} allSubtasks={[a, b, c]} onAddLink={onAddLink} onRemoveLink={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText(/add a sub-task this blocks/i), "c");
    expect(onAddLink).toHaveBeenCalledWith("a", "c");
  });

  it("removes a blocks link", async () => {
    const onRemoveLink = vi.fn();
    render(<SubtaskLinksField subtask={a} allSubtasks={[a, b, c]} onAddLink={vi.fn()} onRemoveLink={onRemoveLink} />);
    await userEvent.click(screen.getByRole("button", { name: /remove blocks Beta/i }));
    expect(onRemoveLink).toHaveBeenCalledWith("a", "b");
  });

  it("does not offer itself as a link target", () => {
    render(<SubtaskLinksField subtask={a} allSubtasks={[a, b, c]} onAddLink={vi.fn()} onRemoveLink={vi.fn()} />);
    const select = screen.getByLabelText(/add a sub-task this blocks/i) as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).not.toContain("a");
  });
});
