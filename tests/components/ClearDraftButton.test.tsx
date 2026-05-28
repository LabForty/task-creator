import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClearDraftButton } from "@/components/ClearDraftButton";

describe("<ClearDraftButton>", () => {
  it("renders a Clear button by default and asks for confirm on click", async () => {
    const onConfirm = vi.fn();
    render(<ClearDraftButton onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: /^clear$/i }));
    // After first click, inline confirm is shown.
    expect(screen.getByText(/clear this draft\?/i)).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("fires onConfirm when the user confirms", async () => {
    const onConfirm = vi.fn();
    render(<ClearDraftButton onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: /^clear$/i }));
    await userEvent.click(screen.getByRole("button", { name: /^yes$/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("cancels without firing onConfirm", async () => {
    const onConfirm = vi.fn();
    render(<ClearDraftButton onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: /^clear$/i }));
    await userEvent.click(screen.getByRole("button", { name: /^no$/i }));
    expect(onConfirm).not.toHaveBeenCalled();
    // Returns to the default Clear button.
    expect(screen.getByRole("button", { name: /^clear$/i })).toBeInTheDocument();
  });
});
