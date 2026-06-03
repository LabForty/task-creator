import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DraftsView } from "@/components/drafts/DraftsView";

describe("DraftsView", () => {
  it("shows a loading state", () => {
    render(<DraftsView state={{ kind: "loading" }} onDelete={() => {}} onRetry={() => {}} />);
    expect(screen.getByTestId("drafts-loading")).toBeInTheDocument();
  });
  it("shows an empty state with a CTA to the creator", () => {
    render(<DraftsView state={{ kind: "empty" }} onDelete={() => {}} onRetry={() => {}} />);
    expect(screen.getByText(/no drafts yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create a task/i })).toHaveAttribute("href", "/");
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
  it("renders cards when loaded", () => {
    render(
      <DraftsView
        state={{ kind: "loaded", items: [{ id: "d1", workingTitle: "X", mode: "single", updatedAt: "2026-06-03T12:00:00Z", preview: "p" }] }}
        onDelete={() => {}}
        onRetry={() => {}}
      />,
    );
    expect(screen.getByText("X")).toBeInTheDocument();
  });
});
