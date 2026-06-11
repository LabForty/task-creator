import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
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
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
  it("moves focus to Cancel on open (safe default for destructive confirm)", () => {
    render(<ConfirmPopover {...PROPS} open />);
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });
  it("shows the message and fires onConfirm", async () => {
    const onConfirm = vi.fn();
    render(<ConfirmPopover {...PROPS} open onConfirm={onConfirm} />);
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Delete this draft?");
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
    expect(onCancel).toHaveBeenCalledOnce();
  });
  // The anchor that opened the popover must not count as "outside" — otherwise
  // its mousedown cancels and its click reopens, which blinks the popover and
  // makes the anchor unable to toggle it closed.
  it("ignores mousedown inside the anchor element", async () => {
    const onCancel = vi.fn();
    const anchorRef = createRef<HTMLDivElement>();
    render(
      <div>
        <div ref={anchorRef}>
          <button>anchor</button>
        </div>
        <button>outside</button>
        <ConfirmPopover {...PROPS} open onCancel={onCancel} anchorRef={anchorRef} />
      </div>,
    );
    await userEvent.click(screen.getByRole("button", { name: "anchor" }));
    expect(onCancel).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "outside" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
