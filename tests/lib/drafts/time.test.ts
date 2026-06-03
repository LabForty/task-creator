import { describe, it, expect } from "vitest";
import { formatRelativeTime } from "@/lib/drafts/time";

const NOW = new Date("2026-06-03T12:00:00Z").getTime();

describe("formatRelativeTime", () => {
  it("formats recent times", () => {
    expect(formatRelativeTime("2026-06-03T11:59:30Z", NOW)).toBe("just now");
    expect(formatRelativeTime("2026-06-03T11:30:00Z", NOW)).toBe("30m ago");
    expect(formatRelativeTime("2026-06-03T09:00:00Z", NOW)).toBe("3h ago");
    expect(formatRelativeTime("2026-06-01T12:00:00Z", NOW)).toBe("2d ago");
  });
  it("returns empty string for invalid input", () => {
    expect(formatRelativeTime("not-a-date", NOW)).toBe("");
  });
});
