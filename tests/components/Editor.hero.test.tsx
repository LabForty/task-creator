import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Editor } from "@/components/Editor";

describe("Editor hero empty state", () => {
  it("shows the hero headline when the draft is blank", () => {
    render(<Editor namespace="test:hero" onFinalize={() => {}} />);
    expect(
      screen.getByRole("heading", { name: /turn an idea into a structured task/i }),
    ).toBeInTheDocument();
  });
});
