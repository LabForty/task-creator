import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "@/components/ui/Card";

describe("Card", () => {
  it("defaults to the solid (hig-card) tone", () => {
    render(<Card>body</Card>);
    expect(screen.getByText("body").className).toContain("hig-card");
  });
  it("applies glass tone", () => {
    render(<Card tone="glass">body</Card>);
    expect(screen.getByText("body").className).toContain("hig-glass");
  });
  it("applies strong glass tone", () => {
    render(<Card tone="glass-strong">body</Card>);
    expect(screen.getByText("body").className).toContain("hig-glass-strong");
  });
  it("merges custom className", () => {
    render(<Card className="p-8">body</Card>);
    expect(screen.getByText("body").className).toContain("p-8");
  });
});
