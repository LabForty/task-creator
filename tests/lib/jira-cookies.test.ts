import { describe, it, expect } from "vitest";
import { buildStateNonce, constantTimeEquals } from "@/lib/jira/cookies";

describe("lib/jira/cookies — state nonce", () => {
  it("buildStateNonce returns a non-empty random string each time", () => {
    const a = buildStateNonce();
    const b = buildStateNonce();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(16);
  });

  it("constantTimeEquals is true for equal strings", () => {
    expect(constantTimeEquals("abc", "abc")).toBe(true);
  });

  it("constantTimeEquals is false for unequal strings", () => {
    expect(constantTimeEquals("abc", "abd")).toBe(false);
    expect(constantTimeEquals("abc", "abcd")).toBe(false);
  });
});
