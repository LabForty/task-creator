import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SuccessFlourish } from "@/components/ui/SuccessFlourish";

describe("SuccessFlourish", () => {
  it("renders a decorative aria-hidden flourish layer", () => {
    const { container } = render(<SuccessFlourish />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute("aria-hidden")).toBe("true");
    expect(root.className).toContain("success-flourish");
    expect(root.className).toContain("pointer-events-none");
  });
});
