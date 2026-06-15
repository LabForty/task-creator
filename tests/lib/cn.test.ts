import { describe, it, expect } from "vitest";
import { cn } from "@/lib/cn";

describe("cn", () => {
  it("joins truthy class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });
  it("drops falsy values", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b");
  });
  it("supports conditional object syntax", () => {
    expect(cn("a", { b: true, c: false })).toBe("a b");
  });
  it("dedupes conflicting tailwind utilities (last wins)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-ink", "text-accent")).toBe("text-accent");
  });
});
