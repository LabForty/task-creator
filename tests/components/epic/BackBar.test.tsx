import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BackBar } from "@/components/epic/BackBar";

describe("<BackBar>", () => {
  it("renders the back label and fires onBack immediately when no confirm is set", async () => {
    const onBack = vi.fn();
    render(<BackBar label="Back to tabs" onBack={onBack} />);
    await userEvent.click(screen.getByRole("button", { name: /back to tabs/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("shows the confirm prompt and waits for Yes when confirmMessage is given", async () => {
    const onBack = vi.fn();
    render(<BackBar label="Back to kneading" confirmMessage="This will clear tasks." onBack={onBack} />);
    await userEvent.click(screen.getByRole("button", { name: /back to kneading/i }));
    expect(screen.getByText(/this will clear tasks\./i)).toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /^yes$/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("cancels confirm without firing onBack", async () => {
    const onBack = vi.fn();
    render(<BackBar label="Back" confirmMessage="Sure?" onBack={onBack} />);
    await userEvent.click(screen.getByRole("button", { name: /^back$/i }));
    await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onBack).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^back$/i })).toBeInTheDocument();
  });
});
