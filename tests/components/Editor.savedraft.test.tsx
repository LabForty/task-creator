import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "@/components/Editor";

describe("Editor — Save as draft", () => {
  it("renders the button and calls onSaveDraft with the current draft", async () => {
    const onSaveDraft = vi.fn();
    render(<Editor namespace="test-ns" onFinalize={() => {}} onSaveDraft={onSaveDraft} />);

    const title = screen.getByPlaceholderText("e.g. Export users as CSV");
    await userEvent.type(title, "My draft");

    await userEvent.click(screen.getByRole("button", { name: /save as draft/i }));

    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(onSaveDraft.mock.calls[0][0]).toMatchObject({ title: "My draft" });
  });

  it("does not render the button when onSaveDraft is absent", () => {
    render(<Editor namespace="test-ns2" onFinalize={() => {}} />);
    expect(screen.queryByRole("button", { name: /save as draft/i })).toBeNull();
  });
});
