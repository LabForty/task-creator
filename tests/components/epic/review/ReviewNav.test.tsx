import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReviewNav } from "@/components/epic/review/ReviewNav";
import type { EpicTask } from "@/lib/epic/tasks";

const tasks: EpicTask[] = [
  { id: "a", title: "Alpha", labels: [], blocks: [], blockedBy: [] },
  { id: "b", title: "Beta", labels: [], blocks: [], blockedBy: [] },
];
const reviews = {
  a: { status: "approved" as const, comment: "", assignee: null },
  b: { status: "change_requested" as const, comment: "fix", assignee: null },
};

describe("<ReviewNav>", () => {
  it("renders an Epic entry and a colored entry per task", () => {
    render(<ReviewNav tasks={tasks} reviews={reviews} selectedId={null} onSelect={vi.fn()} interference={{}} />);
    expect(screen.getByRole("button", { name: /^epic$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /alpha/i }).className).toMatch(/success/);
    expect(screen.getByRole("button", { name: /beta/i }).className).toMatch(/warning/);
  });
  it("selects the epic and a task", async () => {
    const onSelect = vi.fn();
    render(<ReviewNav tasks={tasks} reviews={reviews} selectedId={null} onSelect={onSelect} interference={{}} />);
    await userEvent.click(screen.getByRole("button", { name: /^epic$/i }));
    expect(onSelect).toHaveBeenCalledWith(null);
    await userEvent.click(screen.getByRole("button", { name: /beta/i }));
    expect(onSelect).toHaveBeenCalledWith("b");
  });
  it("marks tasks with an interference warning", () => {
    render(<ReviewNav tasks={tasks} reviews={reviews} selectedId={null} onSelect={vi.fn()} interference={{ a: { affectedTaskId: "a", sourceTaskId: "b", reason: "x" } }} />);
    expect(screen.getByLabelText(/interference warning/i)).toBeInTheDocument();
  });
  it("renders the uploadedIssueKey chip when set on the descriptor", () => {
    render(
      <ReviewNav
        tasks={[
          { id: "a", title: "Alpha", labels: [], blocks: [], blockedBy: [], uploadedIssueKey: "AI-42" },
          { id: "b", title: "Bravo", labels: [], blocks: [], blockedBy: [] },
        ]}
        reviews={{}}
        selectedId={null}
        onSelect={() => {}}
        interference={{}}
      />,
    );
    expect(screen.getByText("AI-42")).toBeInTheDocument();
  });
  it("does not render any chip when no task has uploadedIssueKey", () => {
    render(
      <ReviewNav
        tasks={[{ id: "a", title: "Alpha", labels: [], blocks: [], blockedBy: [] }]}
        reviews={{}}
        selectedId={null}
        onSelect={() => {}}
        interference={{}}
      />,
    );
    expect(screen.queryByText(/^AI-/)).toBeNull();
  });
});
