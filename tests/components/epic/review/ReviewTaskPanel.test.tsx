import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReviewTaskPanel } from "@/components/epic/review/ReviewTaskPanel";
import { EMPTY_REVIEW } from "@/lib/review/types";
import { epicTaskNamespace, type EpicTask } from "@/lib/epic/tasks";

const task: EpicTask = { id: "a", title: "Alpha", labels: [], blocks: [], blockedBy: [] };
const base = {
  allTasks: [task],
  review: EMPTY_REVIEW,
  refreshKey: 0,
  onTitleChange: () => {}, onSetLabels: () => {}, onAddLink: () => {}, onRemoveLink: () => {}, onReviewChange: () => {}, onDelete: () => {},
};

beforeEach(() => {
  window.localStorage.clear();
  // Seed the per-task editor draft so the Editor hydrates with title "Alpha".
  window.localStorage.setItem(
    `task-creator:draft:${epicTaskNamespace("a")}`,
    JSON.stringify({ title: "Alpha", description: "", acceptanceCriteria: [], constraints: "", taskType: "story", mode: "single" }),
  );
});

describe("<ReviewTaskPanel>", () => {
  it("renders the editable task editor (title) and review controls", async () => {
    render(<ReviewTaskPanel task={task} {...base} />);
    expect(await screen.findByDisplayValue("Alpha")).toBeInTheDocument();
    expect(screen.getByLabelText(/task title/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^approve$/i })).toBeInTheDocument();
  });
  it("shows an interference warning banner when warning is set", () => {
    render(<ReviewTaskPanel task={task} {...base} warning={{ affectedTaskId: "a", sourceTaskId: "b", reason: "shares the auth layer" }} />);
    expect(screen.getByText(/shares the auth layer/i)).toBeInTheDocument();
  });
  it("routes review changes", async () => {
    const onReviewChange = vi.fn();
    render(<ReviewTaskPanel task={task} {...base} onReviewChange={onReviewChange} />);
    await userEvent.click(screen.getByRole("button", { name: /^approve$/i }));
    expect(onReviewChange).toHaveBeenCalledWith({ status: "approved" });
  });
});
