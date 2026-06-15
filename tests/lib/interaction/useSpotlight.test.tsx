import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { useSpotlight } from "@/lib/interaction/useSpotlight";

function Probe() {
  const ref = useSpotlight<HTMLDivElement>();
  return <div ref={ref} data-testid="surf" className="spotlight" />;
}

describe("useSpotlight", () => {
  it("sets --spot-x/--spot-y on pointer movement", async () => {
    const { getByTestId } = render(<Probe />);
    const el = getByTestId("surf");
    fireEvent.pointerMove(el, { clientX: 10, clientY: 10 });
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(el.style.getPropertyValue("--spot-x")).not.toBe("");
    expect(el.style.getPropertyValue("--spot-y")).not.toBe("");
  });
});
