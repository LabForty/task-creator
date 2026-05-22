import { describe, it, expect } from "vitest";
import {
  EMPTY_METADATA,
  MAX_DRAFT_ATTACHMENT_BYTES_DEFAULT,
  isValidIssueKey,
  isValidFlagReason,
  normalizeLabel,
  dedupeLabels,
} from "@/lib/jira/metadata";

describe("lib/jira/metadata", () => {
  it("EMPTY_METADATA has empty arrays and flagged=false", () => {
    expect(EMPTY_METADATA).toEqual({
      labels: [],
      linkedIssues: [],
      attachments: [],
      flagged: false,
    });
  });

  it("MAX_DRAFT_ATTACHMENT_BYTES_DEFAULT is 10 MiB", () => {
    expect(MAX_DRAFT_ATTACHMENT_BYTES_DEFAULT).toBe(10 * 1024 * 1024);
  });

  it("isValidIssueKey accepts standard keys and rejects junk", () => {
    expect(isValidIssueKey("ABC-1234")).toBe(true);
    expect(isValidIssueKey("AI-1")).toBe(true);
    expect(isValidIssueKey("A1-1")).toBe(false);
    expect(isValidIssueKey("abc-1")).toBe(false);
    expect(isValidIssueKey("ABC-")).toBe(false);
    expect(isValidIssueKey("")).toBe(false);
  });

  it("isValidFlagReason enforces 3–500 chars after trim", () => {
    expect(isValidFlagReason("ok")).toBe(false);
    expect(isValidFlagReason("   ok   ")).toBe(false);
    expect(isValidFlagReason("yes")).toBe(true);
    expect(isValidFlagReason("y".repeat(500))).toBe(true);
    expect(isValidFlagReason("y".repeat(501))).toBe(false);
  });

  it("normalizeLabel trims and lowercases for comparison", () => {
    expect(normalizeLabel("  Backend  ")).toBe("backend");
    expect(normalizeLabel("MIXED-Case")).toBe("mixed-case");
  });

  it("dedupeLabels is case-insensitive and preserves first-seen casing", () => {
    expect(dedupeLabels(["Backend", "backend", "Frontend", "BACKEND"])).toEqual([
      "Backend",
      "Frontend",
    ]);
  });
});
