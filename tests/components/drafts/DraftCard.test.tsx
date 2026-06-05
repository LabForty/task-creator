import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DraftCard } from "@/components/drafts/DraftCard";

const ITEM = {
  id: "d1",
  workingTitle: "Export users",
  mode: "single",
  updatedAt: "2026-06-03T11:30:00Z",
  preview: "We need a CSV export",
};

const EPIC = {
  id: "e1",
  workingTitle: "Checkout revamp",
  mode: "epic",
  updatedAt: "2026-06-03T11:30:00Z",
  preview: "3 tasks",
};

describe("DraftCard", () => {
  it("renders title, preview, time, and an Open link to the editor", () => {
    render(<DraftCard item={ITEM} now={new Date("2026-06-03T12:00:00Z").getTime()} onDelete={() => {}} />);
    expect(screen.getByText("We need a CSV export")).toBeInTheDocument();
    expect(screen.getByText("30m ago")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open/i })).toHaveAttribute("href", "/?draft=d1");
  });
  it("makes the whole card clickable via a stretched title link", () => {
    render(<DraftCard item={ITEM} now={Date.now()} onDelete={() => {}} />);
    expect(screen.getByRole("link", { name: "Export users" })).toHaveAttribute("href", "/?draft=d1");
  });
  it("asks for confirmation before deleting", async () => {
    const onDelete = vi.fn();
    render(<DraftCard item={ITEM} now={Date.now()} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(onDelete).not.toHaveBeenCalled(); // no immediate delete
    const dialog = screen.getByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith("d1");
  });
  it("cancelling the confirm keeps the draft", async () => {
    const onDelete = vi.fn();
    render(<DraftCard item={ITEM} now={Date.now()} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
  it("merges the task count into the Epic chip and hides the redundant preview", () => {
    render(<DraftCard item={EPIC} now={new Date("2026-06-03T12:00:00Z").getTime()} onDelete={() => {}} />);
    expect(screen.getByText("Epic · 3 tasks")).toBeInTheDocument();
    // preview text "3 tasks" must not ALSO render as a paragraph
    expect(screen.getAllByText(/3 tasks/)).toHaveLength(1);
  });
  it("renders a Single chip for single drafts", () => {
    render(<DraftCard item={ITEM} now={Date.now()} onDelete={() => {}} />);
    expect(screen.getByText("Single")).toBeInTheDocument();
  });
});
