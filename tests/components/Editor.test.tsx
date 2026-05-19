import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "@/components/Editor";

beforeEach(() => window.localStorage.clear());

describe("<Editor>", () => {
  it("disables Finalize when title is empty", () => {
    render(<Editor namespace="t1" onFinalize={vi.fn()} />);
    expect(screen.getByRole("button", { name: /finalize task/i })).toBeDisabled();
  });

  it("enables Finalize once a title is typed", async () => {
    render(<Editor namespace="t2" onFinalize={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/task title/i), "Export users");
    expect(screen.getByRole("button", { name: /finalize task/i })).not.toBeDisabled();
  });

  it("calls onFinalize with the assembled draft", async () => {
    const onFinalize = vi.fn();
    render(<Editor namespace="t3" onFinalize={onFinalize} />);
    await userEvent.type(screen.getByLabelText(/task title/i), "Export users");
    await userEvent.type(screen.getByLabelText(/^description/i), "Need CSV export");
    fireEvent.change(screen.getByLabelText(/acceptance criteria/i), {
      target: { value: "First ac\nSecond ac" },
    });
    await userEvent.click(screen.getByRole("button", { name: /finalize task/i }));
    expect(onFinalize).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Export users",
        description: "Need CSV export",
        acceptanceCriteria: ["First ac", "Second ac"],
      }),
    );
  });

  it("does not call onFinalize when title is whitespace-only", async () => {
    const onFinalize = vi.fn();
    render(<Editor namespace="t4" onFinalize={onFinalize} />);
    await userEvent.type(screen.getByLabelText(/task title/i), "   ");
    await userEvent.click(screen.getByRole("button", { name: /finalize task/i }));
    expect(onFinalize).not.toHaveBeenCalled();
  });

  it("hydrates fields from localStorage on mount", async () => {
    window.localStorage.setItem(
      "task-creator:draft:t5",
      JSON.stringify({ title: "Persisted", description: "Hi", acceptanceCriteria: [], constraints: "" }),
    );
    render(<Editor namespace="t5" onFinalize={vi.fn()} />);
    const title = await screen.findByDisplayValue("Persisted");
    expect(title).toBeInTheDocument();
  });

  it("respects the disabled prop on the submit button", () => {
    render(<Editor namespace="t6" onFinalize={vi.fn()} disabled />);
    expect(screen.getByRole("button", { name: /finalize task/i })).toBeDisabled();
  });
});
