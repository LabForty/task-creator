import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmPopover } from "@/components/ui/ConfirmPopover";

const PROPS = {
  message: "Delete this draft? This can't be undone.",
  confirmLabel: "Delete",
  onConfirm: () => {},
  onCancel: () => {},
};

describe("ConfirmPopover", () => {
  it("renders nothing when closed", () => {
    render(<ConfirmPopover {...PROPS} open={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("shows the message and fires onConfirm", async () => {
    const onConfirm = vi.fn();
    render(<ConfirmPopover {...PROPS} open onConfirm={onConfirm} />);
    expect(screen.getByRole("dialog")).toHaveTextContent("Delete this draft?");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
  it("fires onCancel from the Cancel button", async () => {
    const onCancel = vi.fn();
    render(<ConfirmPopover {...PROPS} open onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
  it("fires onCancel on Escape", async () => {
    const onCancel = vi.fn();
    render(<ConfirmPopover {...PROPS} open onCancel={onCancel} />);
    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledOnce();
  });
  it("fires onCancel on outside click", async () => {
    const onCancel = vi.fn();
    render(
      <div>
        <button>outside</button>
        <ConfirmPopover {...PROPS} open onCancel={onCancel} />
      </div>,
    );
    await userEvent.click(screen.getByRole("button", { name: "outside" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
