import { describe, it, expect } from "vitest";
import { findViolations } from "../../scripts/check-tokens.mjs";

describe("findViolations", () => {
  it("flags a raw hex colour in a className", () => {
    const v = findViolations('foo.tsx', '<div className="bg-[#ff0000]" />');
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe("arbitrary-color");
  });
  it("flags a bare hex literal", () => {
    const v = findViolations('foo.tsx', 'const c = "#1a1a1a";');
    expect(v.map((x) => x.rule)).toContain("raw-hex");
  });
  it("flags an arbitrary font-size utility", () => {
    const v = findViolations('foo.tsx', 'className="text-[12px]"');
    expect(v.map((x) => x.rule)).toContain("arbitrary-text-size");
  });
  it("ignores defensible layout dimensions", () => {
    expect(findViolations('foo.tsx', 'className="w-[420px] min-h-[320px] max-w-[480px]"')).toHaveLength(0);
  });
  it("ignores lines marked with the allow comment", () => {
    expect(findViolations('foo.tsx', 'fill="#ED3B3B" // design-tokens-allow: brand')).toHaveLength(0);
  });
  it("passes clean token-based code", () => {
    expect(findViolations('foo.tsx', '<div className="bg-surface text-ink text-hig-body" />')).toHaveLength(0);
  });
});
