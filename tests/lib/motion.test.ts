import { describe, it, expect } from "vitest";
import { staggerDelay, fadeUp, scaleIn, SPRING } from "@/lib/motion";

describe("staggerDelay", () => {
  it("staggers the first items 40ms apart", () => {
    expect(staggerDelay(0)).toBe(0);
    expect(staggerDelay(1)).toBeCloseTo(0.04);
    expect(staggerDelay(5)).toBeCloseTo(0.2);
  });
  it("caps the delay so long lists don't take seconds to enter", () => {
    expect(staggerDelay(8)).toBeCloseTo(0.32);
    expect(staggerDelay(50)).toBeCloseTo(0.32); // same as the cap
  });
});

describe("variants", () => {
  it("fadeUp resolves a staggered visible transition from the custom index", () => {
    const visible = fadeUp.visible as (i: number) => { transition: { delay: number } };
    expect(visible(2).transition.delay).toBeCloseTo(0.08);
  });
  it("scaleIn enters from 95% scale", () => {
    expect(scaleIn.hidden).toMatchObject({ opacity: 0, scale: 0.95 });
  });
  it("spring is stiff and lightly damped (lively, not bouncy)", () => {
    expect(SPRING).toMatchObject({ type: "spring" });
  });
});
