import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReviewTaskPanel } from "@/components/epic/review/ReviewTaskPanel";
import { EMPTY_REVIEW } from "@/lib/review/types";
import type { SubTask } from "@/lib/subtasks/types";

const st: SubTask = { id: "a", title: "Alpha", description: "d", labels: [], blocks: [], blockedBy: [] };
const base = {
  allSubtasks: [st],
  review: EMPTY_REVIEW,
  onUpdate: () => {}, onSetLabels: () => {}, onAddLink: () => {}, onRemoveLink: () => {}, onReviewChange: () => {}, onDelete: () => {},
};

describe("<ReviewTaskPanel>", () => {
  it("renders the editable card (title) and review controls", () => {
    render(<ReviewTaskPanel subtask={st} {...base} />);
    expect(screen.getByDisplayValue("Alpha")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^approve$/i })).toBeInTheDocument();
  });
  it("shows an interference warning banner when warning is set", () => {
    render(<ReviewTaskPanel subtask={st} {...base} warning={{ affectedTaskId: "a", sourceTaskId: "b", reason: "shares the auth layer" }} />);
    expect(screen.getByText(/shares the auth layer/i)).toBeInTheDocument();
  });
  it("routes review changes", async () => {
    const onReviewChange = vi.fn();
    render(<ReviewTaskPanel subtask={st} {...base} onReviewChange={onReviewChange} />);
    await userEvent.click(screen.getByRole("button", { name: /^approve$/i }));
    expect(onReviewChange).toHaveBeenCalledWith({ status: "approved" });
  });
});
