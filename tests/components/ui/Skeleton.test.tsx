import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Skeleton } from "@/components/ui/Skeleton";

describe("Skeleton", () => {
  it("renders a decorative shimmer block and merges className", () => {
    const { container } = render(<Skeleton className="h-4 w-44" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.className).toContain("hig-shimmer");
    expect(el.className).toContain("h-4");
    expect(el.className).toContain("w-44");
  });
});
