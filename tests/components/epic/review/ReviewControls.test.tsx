import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReviewControls } from "@/components/epic/review/ReviewControls";
import { EMPTY_REVIEW } from "@/lib/review/types";

describe("<ReviewControls>", () => {
  it("approves immediately", async () => {
    const onChange = vi.fn();
    render(<ReviewControls review={EMPTY_REVIEW} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /^approve$/i }));
    expect(onChange).toHaveBeenCalledWith({ status: "approved" });
  });
  it("denies immediately", async () => {
    const onChange = vi.fn();
    render(<ReviewControls review={EMPTY_REVIEW} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /^deny$/i }));
    expect(onChange).toHaveBeenCalledWith({ status: "denied" });
  });
  it("requires a comment before applying change-requested", async () => {
    const onChange = vi.fn();
    render(<ReviewControls review={EMPTY_REVIEW} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /change requested/i }));
    const apply = screen.getByRole("button", { name: /apply change request/i });
    expect(apply).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/comment/i), "please fix X");
    expect(screen.getByRole("button", { name: /apply change request/i })).not.toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /apply change request/i }));
    expect(onChange).toHaveBeenCalledWith({ status: "change_requested", comment: "please fix X" });
  });
  it("edits the assignee", async () => {
    const onChange = vi.fn();
    render(<ReviewControls review={EMPTY_REVIEW} onChange={onChange} />);
    await userEvent.type(screen.getByLabelText(/assignee/i), "sam");
    expect(onChange).toHaveBeenLastCalledWith({ assignee: "sam" });
  });
});
