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

  it("loadDraft defaults mode to 'single' when missing", () => {
    window.localStorage.setItem("task-creator:draft:m1", JSON.stringify({ title: "T" }));
    expect(loadDraft("m1").mode).toBe("single");
  });

  it("loadDraft preserves an epic mode + knead block", () => {
    const knead = { status: "interviewing", rounds: [{ questions: [], answers: {} }] };
    window.localStorage.setItem(
      "task-creator:draft:m2",
      JSON.stringify({ title: "T", description: "D", mode: "epic", knead }),
    );
    const d = loadDraft("m2");
    expect(d.mode).toBe("epic");
    expect(d.knead).toEqual(knead);
  });

  it("loadDraft falls back to 'single' for an unknown mode value", () => {
    window.localStorage.setItem("task-creator:draft:m3", JSON.stringify({ mode: "bogus" }));
    expect(loadDraft("m3").mode).toBe("single");
  });

  it("loadDraft preserves an epicTasks array", () => {
    const epicTasks = [{ id: "t1", title: "T", labels: ["x"], blocks: [], blockedBy: [] }];
    window.localStorage.setItem("task-creator:draft:et", JSON.stringify({ title: "T", epicTasks }));
    expect(loadDraft("et").epicTasks).toEqual(epicTasks);
  });
  it("loadDraft leaves epicTasks undefined when absent", () => {
    window.localStorage.setItem("task-creator:draft:et2", JSON.stringify({ title: "T" }));
    expect(loadDraft("et2").epicTasks).toBeUndefined();
  });
});
