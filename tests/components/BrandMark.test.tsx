import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { BrandMark } from "@/components/BrandMark";

describe("BrandMark", () => {
  it("renders an aria-hidden svg sized by the size prop", () => {
    const { container } = render(<BrandMark size={48} />);
    const host = container.querySelector(".labforty-mark") as HTMLElement;
    expect(host).not.toBeNull();
    expect(host.style.width).toBe("48px");
    const svg = host.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("aria-hidden")).toBe("true");
  });
  it("defaults to size 36", () => {
    const { container } = render(<BrandMark />);
    expect((container.querySelector(".labforty-mark") as HTMLElement).style.width).toBe("36px");
  });
});
