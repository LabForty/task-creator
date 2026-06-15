import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TextField } from "@/components/ui/TextField";

describe("TextField", () => {
  it("renders label + input wired by id", () => {
    render(<TextField label="Title" />);
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
  });
  it("shows an error message and danger border when error is set", () => {
    render(<TextField label="Title" error="Required" />);
    const msg = screen.getByText("Required");
    expect(msg.className).toContain("text-danger");
    const input = screen.getByLabelText("Title");
    expect(input.className).toContain("border-danger");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });
});
