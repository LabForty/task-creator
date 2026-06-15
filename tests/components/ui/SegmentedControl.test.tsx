import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

const ITEMS = [
  { value: "single", label: "Single" },
  { value: "epic", label: "Epic" },
] as const;

describe("SegmentedControl", () => {
  it("marks the active segment and uses shadow-card (no arbitrary shadow)", () => {
    render(<SegmentedControl value="single" items={ITEMS as any} onChange={() => {}} ariaLabel="Mode" />);
    const active = screen.getByRole("tab", { name: "Single" });
    expect(active).toHaveAttribute("aria-selected", "true");
    expect(active.className).toContain("shadow-card");
    expect(active.className).not.toContain("shadow-[");
    expect(active.className).not.toContain("rounded-[");
  });
  it("fires onChange when a segment is clicked", async () => {
    const onChange = vi.fn();
    render(<SegmentedControl value="single" items={ITEMS as any} onChange={onChange} ariaLabel="Mode" />);
    await userEvent.click(screen.getByRole("tab", { name: "Epic" }));
    expect(onChange).toHaveBeenCalledWith("epic");
  });
});
