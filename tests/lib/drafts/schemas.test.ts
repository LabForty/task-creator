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
  it("preserves epic fields (knead, epicTasks, subtaskDrafts)", () => {
    const input = {
      mode: "epic" as const,
      knead: { status: "complete", rounds: [] },
      epicTasks: [{ id: "t1", title: "First", labels: [], blocks: [], blockedBy: [] }],
      subtaskDrafts: { t1: { title: "First", description: "body", mode: "single" } },
    };
    const r = DraftUpsertSchema.safeParse(input);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.mode).toBe("epic");
      expect(r.data.knead).toEqual(input.knead);
      expect(r.data.epicTasks).toEqual(input.epicTasks);
      expect(r.data.subtaskDrafts).toEqual(input.subtaskDrafts);
    }
  });
  it("accepts attached context links", () => {
    const r = DraftUpsertSchema.safeParse({ contextLinks: ["https://example.com/spec"] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.contextLinks).toEqual(["https://example.com/spec"]);
  });
  it("strips genuinely unknown top-level keys", () => {
    const r = DraftUpsertSchema.safeParse({ title: "x", bogus: 1 });
    expect(r.success).toBe(true);
    if (r.success) expect("bogus" in r.data).toBe(false);
  });
});
