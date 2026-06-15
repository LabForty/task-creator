import { describe, it, expect } from "vitest";
import { ratio, LIGHT, DARK, PAIRS } from "../../scripts/contrast-check.mjs";

type Theme = Record<string, string>;

describe("token contrast (AA guard)", () => {
  for (const pair of PAIRS) {
    const fg = pair[0] as string;
    const bg = pair[1] as string;
    const min = pair[2] as number;
    const label = pair[3] as string;
    it(`LIGHT: ${label} (${fg} on ${bg}) clears ${min}`, () => {
      expect(ratio((LIGHT as Theme)[fg], (LIGHT as Theme)[bg])).toBeGreaterThanOrEqual(min);
    });
    it(`DARK: ${label} (${fg} on ${bg}) clears ${min}`, () => {
      expect(ratio((DARK as Theme)[fg], (DARK as Theme)[bg])).toBeGreaterThanOrEqual(min);
    });
  }
});
