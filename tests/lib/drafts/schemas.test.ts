import { describe, it, expect } from "vitest";
import { DraftUpsertSchema } from "@/lib/drafts/schemas";

describe("DraftUpsertSchema", () => {
  it("accepts a completely empty draft (no publish-time requirements)", () => {
    const r = DraftUpsertSchema.safeParse({});
    expect(r.success).toBe(true);
  });
  it("accepts partial input exactly as entered", () => {
    const r = DraftUpsertSchema.safeParse({ title: "", description: "half a thought" });
    expect(r.success).toBe(true);
  });
  it("rejects a title longer than 200 chars", () => {
    const r = DraftUpsertSchema.safeParse({ title: "x".repeat(201) });
    expect(r.success).toBe(false);
  });
  it("rejects a non-string title", () => {
    const r = DraftUpsertSchema.safeParse({ title: 123 });
    expect(r.success).toBe(false);
  });
});
