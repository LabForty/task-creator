import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReviewNav } from "@/components/epic/review/ReviewNav";
import type { SubTask } from "@/lib/subtasks/types";

const subtasks: SubTask[] = [
  { id: "a", title: "Alpha", description: "", labels: [], blocks: [], blockedBy: [] },
  { id: "b", title: "Beta", description: "", labels: [], blocks: [], blockedBy: [] },
];
const reviews = {
  a: { status: "approved" as const, comment: "", assignee: null },
  b: { status: "change_requested" as const, comment: "fix", assignee: null },
};

describe("<ReviewNav>", () => {
  it("renders an Epic entry and a colored entry per task", () => {
    render(<ReviewNav subtasks={subtasks} reviews={reviews} selectedId={null} onSelect={vi.fn()} interference={{}} />);
    expect(screen.getByRole("button", { name: /^epic$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /alpha/i }).className).toMatch(/success/);
    expect(screen.getByRole("button", { name: /beta/i }).className).toMatch(/warning/);
  });
  it("selects the epic and a task", async () => {
    const onSelect = vi.fn();
    render(<ReviewNav subtasks={subtasks} reviews={reviews} selectedId={null} onSelect={onSelect} interference={{}} />);
    await userEvent.click(screen.getByRole("button", { name: /^epic$/i }));
    expect(onSelect).toHaveBeenCalledWith(null);
    await userEvent.click(screen.getByRole("button", { name: /beta/i }));
    expect(onSelect).toHaveBeenCalledWith("b");
  });
  it("marks tasks with an interference warning", () => {
    render(<ReviewNav subtasks={subtasks} reviews={reviews} selectedId={null} onSelect={vi.fn()} interference={{ a: { affectedTaskId: "a", sourceTaskId: "b", reason: "x" } }} />);
    expect(screen.getByLabelText(/interference warning/i)).toBeInTheDocument();
  });
});
