import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LostDoughWarning } from "@/components/epic/LostDoughWarning";

describe("<LostDoughWarning>", () => {
  it("calls onConfirm with keepAnswers=false by default", async () => {
    const onConfirm = vi.fn();
    render(<LostDoughWarning onConfirm={onConfirm} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /re-?knead/i }));
    expect(onConfirm).toHaveBeenCalledWith(false);
  });

  it("calls onConfirm with keepAnswers=true when the checkbox is ticked", async () => {
    const onConfirm = vi.fn();
    render(<LostDoughWarning onConfirm={onConfirm} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole("checkbox", { name: /keep already-answered questions/i }));
    await userEvent.click(screen.getByRole("button", { name: /re-?knead/i }));
    expect(onConfirm).toHaveBeenCalledWith(true);
  });

  it("calls onCancel when dismissed", async () => {
    const onCancel = vi.fn();
    render(<LostDoughWarning onConfirm={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
