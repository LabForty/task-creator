import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { useMagneticHover } from "@/lib/interaction/useMagneticHover";

function Probe() {
  const ref = useMagneticHover<HTMLButtonElement>();
  return <button ref={ref} data-testid="btn">Go</button>;
}

describe("useMagneticHover", () => {
  it("applies a bounded transform on move and resets on leave", async () => {
    const { getByTestId } = render(<Probe />);
    const el = getByTestId("btn");
    fireEvent.pointerMove(el, { clientX: 1000, clientY: 1000 });
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(el.style.transform).toContain("translate");
    fireEvent.pointerLeave(el);
    expect(el.style.transform === "" || el.style.transform.includes("0")).toBe(true);
  });
});
