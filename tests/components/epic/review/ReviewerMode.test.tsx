import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReviewerMode } from "@/components/epic/review/ReviewerMode";
import { initReviews } from "@/lib/review/state";
import type { SubTask } from "@/lib/subtasks/types";

const subtasks: SubTask[] = [
  { id: "a", title: "Alpha", description: "", labels: [], blocks: [], blockedBy: [] },
  { id: "b", title: "Beta", description: "", labels: [], blocks: [], blockedBy: [] },
];
const base = {
  epicTitle: "My Epic", epicDescriptionHtml: "<p>desc</p>", subtasks,
  reviews: initReviews(["a", "b"]), interference: {},
  onSelect: vi.fn(), onEditTasks: vi.fn(), onUpdate: vi.fn(), onSetLabels: vi.fn(),
  onAddLink: vi.fn(), onRemoveLink: vi.fn(), onReviewChange: vi.fn(), onDelete: vi.fn(),
};

describe("<ReviewerMode>", () => {
  it("renders epic preview, nav, a disabled Finalize, and the selected task panel", () => {
    render(<ReviewerMode {...base} selectedId="a" />);
    expect(screen.getByText("My Epic")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: /review navigation/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /finalize/i })).toBeDisabled();
    expect(screen.getByDisplayValue("Alpha")).toBeInTheDocument();
  });
  it("shows a placeholder when nothing is selected", () => {
    render(<ReviewerMode {...base} selectedId={null} />);
    expect(screen.getByText(/select a task/i)).toBeInTheDocument();
  });
  it("fires onEditTasks", async () => {
    const onEditTasks = vi.fn();
    render(<ReviewerMode {...base} selectedId="a" onEditTasks={onEditTasks} />);
    await userEvent.click(screen.getByRole("button", { name: /edit tasks/i }));
    expect(onEditTasks).toHaveBeenCalled();
  });
});
