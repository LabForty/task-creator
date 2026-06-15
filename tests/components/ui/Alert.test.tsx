import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Alert } from "@/components/ui/Alert";

describe("Alert", () => {
  it("renders with role=alert and the message", () => {
    render(<Alert>Something broke</Alert>);
    const el = screen.getByRole("alert");
    expect(el).toHaveTextContent("Something broke");
  });
  it("uses danger tone styling by default", () => {
    render(<Alert>err</Alert>);
    const el = screen.getByRole("alert");
    expect(el.className).toContain("border-danger/30");
    expect(el.className).toContain("text-danger");
  });
  it("supports an accent (info) tone", () => {
    render(<Alert tone="accent">info</Alert>);
    expect(screen.getByRole("alert").className).toContain("bg-accent-tint");
  });
  it("uses danger-strong for danger-tone text", () => {
    render(<Alert>broke</Alert>);
    expect(screen.getByRole("alert").className).toContain("text-danger-strong");
  });
});
