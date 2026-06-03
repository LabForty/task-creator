import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DraftCard } from "@/components/drafts/DraftCard";

const ITEM = {
  id: "d1",
  workingTitle: "Export users",
  mode: "single",
  updatedAt: "2026-06-03T11:30:00Z",
  preview: "We need a CSV export",
};

describe("DraftCard", () => {
  it("renders title, preview, and an Open link to the editor", () => {
    render(<DraftCard item={ITEM} now={new Date("2026-06-03T12:00:00Z").getTime()} onDelete={() => {}} />);
    expect(screen.getByText("Export users")).toBeInTheDocument();
    expect(screen.getByText("We need a CSV export")).toBeInTheDocument();
    expect(screen.getByText("30m ago")).toBeInTheDocument();
    const open = screen.getByRole("link", { name: /open/i });
    expect(open).toHaveAttribute("href", "/?draft=d1");
  });
  it("calls onDelete with the id", async () => {
    const onDelete = vi.fn();
    render(<DraftCard item={ITEM} now={Date.now()} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith("d1");
  });
  it("renders an Epic chip and task-count preview for epic drafts", () => {
    const epic = { id: "e1", workingTitle: "Checkout revamp", mode: "epic", updatedAt: "2026-06-03T11:30:00Z", preview: "3 tasks" };
    render(<DraftCard item={epic} now={new Date("2026-06-03T12:00:00Z").getTime()} onDelete={() => {}} />);
    expect(screen.getByText("Epic")).toBeInTheDocument();
    expect(screen.getByText("3 tasks")).toBeInTheDocument();
  });
  it("renders a Single chip for single drafts", () => {
    render(<DraftCard item={ITEM} now={Date.now()} onDelete={() => {}} />);
    expect(screen.getByText("Single")).toBeInTheDocument();
  });
});
