import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DraftsView } from "@/components/drafts/DraftsView";

const ITEMS = [
  { id: "d1", workingTitle: "X", mode: "single", updatedAt: "2026-06-03T12:00:00Z", preview: "p" },
  { id: "d2", workingTitle: "Y", mode: "epic", updatedAt: "2026-06-03T12:00:00Z", preview: "2 tasks" },
];

describe("DraftsView", () => {
  it("shows skeleton cards while loading", () => {
    render(<DraftsView state={{ kind: "loading" }} onDelete={() => {}} onRetry={() => {}} />);
    expect(screen.getByTestId("drafts-loading")).toBeInTheDocument();
  });
  it("shows an empty state with a CTA to the creator", () => {
    render(<DraftsView state={{ kind: "empty" }} onDelete={() => {}} onRetry={() => {}} />);
    expect(screen.getByText(/no drafts yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create a task/i })).toHaveAttribute("href", "/");
  });
  it("empty state shows the hero headline and a prominent CTA", () => {
    render(<DraftsView state={{ kind: "empty" }} onDelete={() => {}} onRetry={() => {}} />);
    const h = screen.getByRole("heading", { name: /no drafts yet/i });
    expect(h.className).toContain("text-hig-large");
    const cta = screen.getByRole("link", { name: /create a task/i });
    expect(cta.className).toContain("cta-prominent");
  });
  it("loading state uses shimmer, not animate-pulse", () => {
    const { container } = render(<DraftsView state={{ kind: "loading" }} onDelete={() => {}} onRetry={() => {}} />);
    expect(container.querySelector(".hig-shimmer")).not.toBeNull();
    expect(container.querySelector(".animate-pulse")).toBeNull();
  });
  it("shows an error state with a Retry button", async () => {
    const onRetry = vi.fn();
    render(
      <DraftsView state={{ kind: "error", message: "We couldn't load your drafts." }} onDelete={() => {}} onRetry={onRetry} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't load your drafts.");
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalled();
  });
  it("renders all cards when loaded", () => {
    render(<DraftsView state={{ kind: "loaded", items: ITEMS }} onDelete={() => {}} onRetry={() => {}} />);
    expect(screen.getByText("X")).toBeInTheDocument();
    expect(screen.getByText("Y")).toBeInTheDocument();
  });
  // The delete-confirm popover opens downward, overflowing the card's bottom
  // edge. With multiple drafts the NEXT card's motion.div wrapper (its own
  // stacking context) paints over it. Fix: lift the CONFIRMING card's wrapper
  // above its siblings (zIndex 30) while its popover is open.
  it("elevates the confirming card's wrapper above its siblings, and resets on cancel", async () => {
    render(<DraftsView state={{ kind: "loaded", items: ITEMS }} onDelete={() => {}} onRetry={() => {}} />);

    // The card root is DraftCard's outer "group relative hig-card" div; its
    // parent is the sibling motion.div wrapper whose stacking we elevate.
    const firstCardRoot = screen.getByText("X").closest(".hig-card") as HTMLElement;
    const firstWrapper = firstCardRoot.parentElement as HTMLElement;
    expect(firstWrapper.style.zIndex).toBe(""); // not elevated initially

    // Open the first card's confirm popover via ITS Delete button.
    const firstDeleteBtn = within(firstCardRoot).getByRole("button", { name: /delete/i });
    await userEvent.click(firstDeleteBtn);
    expect(within(firstCardRoot).getByRole("alertdialog")).toBeInTheDocument();
    expect(firstWrapper.style.zIndex).toBe("30");

    // Cancelling closes the popover and resets the wrapper's stacking.
    await userEvent.click(within(firstCardRoot).getByRole("button", { name: "Cancel" }));
    expect(within(firstCardRoot).queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(firstWrapper.style.zIndex).toBe("");
  });
});
