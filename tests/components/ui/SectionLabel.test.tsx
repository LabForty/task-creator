import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionLabel } from "@/components/ui/SectionLabel";

describe("SectionLabel", () => {
  it("renders the eyebrow label class and text", () => {
    render(<SectionLabel>Details</SectionLabel>);
    const el = screen.getByText("Details");
    expect(el.className).toContain("hig-section-label");
  });
  it("merges custom className", () => {
    render(<SectionLabel className="mb-7">Details</SectionLabel>);
    expect(screen.getByText("Details").className).toContain("mb-7");
  });
});
