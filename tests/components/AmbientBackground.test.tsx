import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { AmbientBackground } from "@/components/AmbientBackground";

describe("AmbientBackground", () => {
  it("renders a decorative, non-interactive, behind-content layer", () => {
    const { container } = render(<AmbientBackground />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).not.toBeNull();
    expect(root.getAttribute("aria-hidden")).toBe("true");
    expect(root.className).toContain("pointer-events-none");
    expect(root.className).toContain("-z-10");
    expect(root.className).toContain("absolute");
  });
});
