import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskReviewBar } from "@/components/epic/review/TaskReviewBar";

const base = {
  status: undefined,
  comment: "",
  onStatusChange: () => {},
  onCommentChange: () => {},
};

describe("<TaskReviewBar>", () => {
  it("Approve and Deny apply immediately", async () => {
    const onStatusChange = vi.fn();
    render(<TaskReviewBar {...base} onStatusChange={onStatusChange} />);
    await userEvent.click(screen.getByRole("button", { name: /approve/i }));
    expect(onStatusChange).toHaveBeenCalledWith("approved");
    await userEvent.click(screen.getByRole("button", { name: /deny/i }));
    expect(onStatusChange).toHaveBeenCalledWith("denied");
  });

  it("Request change with an empty comment is blocked and shows an error", async () => {
    const onStatusChange = vi.fn();
    render(<TaskReviewBar {...base} comment="" onStatusChange={onStatusChange} />);
    await userEvent.click(screen.getByRole("button", { name: /request change/i }));
    expect(onStatusChange).not.toHaveBeenCalled();
    expect(screen.getByText(/comment is required/i)).toBeInTheDocument();
  });

  it("Request change applies once a comment is present", async () => {
    const onStatusChange = vi.fn();
    render(<TaskReviewBar {...base} comment="please split this" onStatusChange={onStatusChange} />);
    await userEvent.click(screen.getByRole("button", { name: /request change/i }));
    expect(onStatusChange).toHaveBeenCalledWith("change_requested");
  });

  it("typing fires onCommentChange", async () => {
    const onCommentChange = vi.fn();
    render(<TaskReviewBar {...base} onCommentChange={onCommentChange} />);
    await userEvent.type(screen.getByRole("textbox", { name: /review comment/i }), "x");
    expect(onCommentChange).toHaveBeenCalled();
  });
});
