import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FlagField } from "@/components/jira-metadata/FlagField";

describe("FlagField", () => {
  it("toggles open a reason modal that requires 3+ chars", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FlagField value={{ flagged: false }} onChange={onChange} />);
    await user.click(screen.getByRole("switch", { name: /flag/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    const textarea = screen.getByLabelText(/reason/i);
    const confirm = screen.getByRole("button", { name: /confirm/i });
    expect(confirm).toBeDisabled();

    await user.type(textarea, "ok");
    expect(confirm).toBeDisabled();
    await user.type(textarea, "k");
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(onChange).toHaveBeenCalledWith({ flagged: true, flagReason: "okk" });
  });

  it("Escape cancels the modal and leaves flagged=false", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FlagField value={{ flagged: false }} onChange={onChange} />);
    await user.click(screen.getByRole("switch", { name: /flag/i }));
    await user.keyboard("{Escape}");
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("clearing the flag also clears the reason", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FlagField value={{ flagged: true, flagReason: "x".repeat(5) }} onChange={onChange} />);
    await user.click(screen.getByRole("switch", { name: /flag/i }));
    expect(onChange).toHaveBeenCalledWith({ flagged: false });
  });

  it("View reason re-opens the reason as read-only", async () => {
    const user = userEvent.setup();
    render(<FlagField value={{ flagged: true, flagReason: "blocked on auth" }} onChange={() => {}} />);
    await user.click(screen.getByRole("button", { name: /view reason/i }));
    expect(screen.getByText("blocked on auth")).toBeInTheDocument();
  });
});
