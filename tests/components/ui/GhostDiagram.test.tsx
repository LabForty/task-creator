import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { GhostDiagram } from "@/components/ui/GhostDiagram";

describe("GhostDiagram", () => {
  it("renders a decorative aria-hidden svg", () => {
    const { container } = render(<GhostDiagram />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("aria-hidden")).toBe("true");
    expect(container.firstElementChild!.className).toContain("ghost-diagram");
  });
});
