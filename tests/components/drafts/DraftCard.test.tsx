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
  // AI-50 follow-up: the confirm popover used to blink — the card's hover lift
  // oscillated under a pointer near its bottom edge, and re-clicking the
  // anchor closed (outside-mousedown) then reopened (click) the popover.
  it("clicking the Delete anchor again closes the confirm instead of blinking", async () => {
    render(<DraftCard item={ITEM} now={Date.now()} onDelete={() => {}} />);
    const anchor = screen.getByRole("button", { name: /delete/i });
    await userEvent.click(anchor);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await userEvent.click(anchor);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
  it("pins the card and actions visible while the confirm is open (no hover dependence)", async () => {
    const { container } = render(<DraftCard item={ITEM} now={Date.now()} onDelete={() => {}} />);
    const cardRoot = container.firstElementChild as HTMLElement;
    const actionsRow = cardRoot.querySelector("div.z-10") as HTMLElement;
    expect(actionsRow.className).toContain("group-hover:opacity-100");
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    // While confirming, visibility/lift must not depend on :hover at all.
    expect(actionsRow.className).toContain("opacity-100");
    expect(actionsRow.className).not.toContain("group-hover");
    expect(cardRoot.className).not.toContain("hover:-translate-y-0.5");
  });
  it("folds the task count into the Epic chip", () => {
    render(<DraftCard item={EPIC} now={new Date("2026-06-03T12:00:00Z").getTime()} onDelete={() => {}} />);
    expect(screen.getByText("Epic · 3 tasks")).toBeInTheDocument();
  });
  it("renders a Single chip for single drafts", () => {
    render(<DraftCard item={ITEM} now={Date.now()} onDelete={() => {}} />);
    expect(screen.getByText("Single")).toBeInTheDocument();
  });
  // Task 18 — hover-peek. The peek is revealed purely via CSS (group-hover /
  // group-focus-within), so the assertion is presence-in-DOM, not visibility.
  it("renders a single draft's preview as a hover-peek (present in the DOM)", () => {
    render(<DraftCard item={ITEM} now={Date.now()} onDelete={() => {}} />);
    const peek = screen.getByText("We need a CSV export");
    expect(peek).toBeInTheDocument();
    // The peek mirrors the action-row reveal: gated on group-hover/focus-within.
    const reveal = peek.closest("div");
    expect(reveal?.className).toContain("group-hover:opacity-100");
    expect(reveal?.className).toContain("group-focus-within:opacity-100");
  });
  it("renders an epic's task-count line as a hover-peek (present in the DOM)", () => {
    render(<DraftCard item={EPIC} now={Date.now()} onDelete={() => {}} />);
    // Distinct from the chip's "Epic · 3 tasks"; this is the fuller peek line.
    const peek = screen.getByText("Epic with 3 tasks");
    expect(peek).toBeInTheDocument();
    const reveal = peek.closest("div");
    expect(reveal?.className).toContain("group-hover:grid-rows-[1fr]");
  });
});
