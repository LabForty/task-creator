import { describe, it, expect, beforeEach } from "vitest";
import { loadDraft, saveDraft, clearDraft, isDirty, EMPTY_DRAFT } from "@/lib/draft/autosave";

beforeEach(() => window.localStorage.clear());

describe("lib/draft/autosave", () => {
  it("loadDraft returns EMPTY_DRAFT when nothing is stored", () => {
    expect(loadDraft("ns1")).toEqual(EMPTY_DRAFT);
  });

  it("saveDraft + loadDraft round-trips", () => {
    saveDraft("ns2", { ...EMPTY_DRAFT, title: "T", description: "D", acceptanceCriteria: ["a", "b"] });
    expect(loadDraft("ns2")).toEqual({ ...EMPTY_DRAFT, title: "T", description: "D", acceptanceCriteria: ["a", "b"] });
  });

  it("loadDraft tolerates corrupted JSON", () => {
    window.localStorage.setItem("task-creator:draft:bad", "{not json");
    expect(loadDraft("bad")).toEqual(EMPTY_DRAFT);
  });

  it("loadDraft tolerates missing fields", () => {
    window.localStorage.setItem("task-creator:draft:partial", JSON.stringify({ title: "T" }));
    expect(loadDraft("partial")).toEqual({ ...EMPTY_DRAFT, title: "T" });
  });

  it("clearDraft removes the stored draft", () => {
    saveDraft("ns3", { ...EMPTY_DRAFT, title: "T" });
    clearDraft("ns3");
    expect(loadDraft("ns3")).toEqual(EMPTY_DRAFT);
  });

  it("namespaces are isolated", () => {
    saveDraft("a", { ...EMPTY_DRAFT, title: "A" });
    saveDraft("b", { ...EMPTY_DRAFT, title: "B" });
    expect(loadDraft("a").title).toBe("A");
    expect(loadDraft("b").title).toBe("B");
  });

  it("isDirty is false for an empty draft", () => {
    expect(isDirty(EMPTY_DRAFT)).toBe(false);
  });

  it("isDirty is true when any field has content", () => {
    expect(isDirty({ ...EMPTY_DRAFT, title: "T" })).toBe(true);
    expect(isDirty({ ...EMPTY_DRAFT, acceptanceCriteria: ["x"] })).toBe(true);
  });
});
