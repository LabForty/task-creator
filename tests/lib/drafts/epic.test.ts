import { describe, it, expect } from "vitest";
import { EMPTY_DRAFT, type Draft } from "@/lib/draft/autosave";
import { EMPTY_KNEAD, type KneadState } from "@/lib/knead/types";
import type { EpicTask } from "@/lib/epic/tasks";
import {
  buildEpicDraftPayload,
  applyEpicDraft,
  shouldDeleteEpicDraftOnClose,
} from "@/lib/drafts/epic";

const base: Draft = { ...EMPTY_DRAFT, title: "My Epic", description: "epic desc", mode: "epic" };
const knead: KneadState = { status: "complete", rounds: [] };
const tasks: EpicTask[] = [
  { id: "t1", title: "First", labels: [], blocks: [], blockedBy: [] },
  { id: "t2", title: "Second", labels: [], blocks: [], blockedBy: [] },
];
const subtaskDrafts: Record<string, Draft> = {
  t1: { ...EMPTY_DRAFT, title: "First", description: "one", chatHistory: [{ role: "user", content: "hi" }] as any },
  t2: { ...EMPTY_DRAFT, title: "Second", description: "two" },
};

describe("buildEpicDraftPayload", () => {
  it("attaches mode/knead/epicTasks/subtaskDrafts and preserves base fields", () => {
    const p = buildEpicDraftPayload(base, knead, tasks, subtaskDrafts);
    expect(p.mode).toBe("epic");
    expect(p.title).toBe("My Epic");
    expect(p.knead).toEqual(knead);
    expect(p.epicTasks).toEqual(tasks);
    expect(p.subtaskDrafts).toEqual(subtaskDrafts);
  });
});

describe("applyEpicDraft", () => {
  it("round-trips a built payload back into hydration data", () => {
    const p = buildEpicDraftPayload(base, knead, tasks, subtaskDrafts);
    const applied = applyEpicDraft(p);
    expect(applied.mainDraft.mode).toBe("epic");
    expect(applied.mainDraft.title).toBe("My Epic");
    expect(applied.mainDraft.knead).toEqual(knead);
    expect(applied.mainDraft.epicTasks).toEqual(tasks);
    expect(applied.epicTasks).toEqual(tasks);
    expect(applied.subtaskDrafts).toEqual(subtaskDrafts);
    expect(applied.analyzeChatById.t1).toHaveLength(1);
    expect(applied.analyzeChatById.t2).toBeUndefined();
  });
  it("defaults knead and collections when payload is sparse", () => {
    const applied = applyEpicDraft({ mode: "epic" });
    expect(applied.knead).toEqual(EMPTY_KNEAD);
    expect(applied.epicTasks).toEqual([]);
    expect(applied.subtaskDrafts).toEqual({});
    expect(applied.analyzeChatById).toEqual({});
  });
  it("drops knead rounds from a blank epic payload", () => {
    const staleKnead: KneadState = {
      status: "interviewing",
      rounds: [{
        questions: [{ id: "old", prompt: "Old?", section: "business", type: "text" }],
        answers: {},
      }],
      sourceDescription: "Old epic text",
    };
    const applied = applyEpicDraft({ ...EMPTY_DRAFT, mode: "epic", knead: staleKnead });
    expect(applied.knead).toEqual(EMPTY_KNEAD);
    expect(applied.mainDraft.knead).toEqual(EMPTY_KNEAD);
  });
});

describe("shouldDeleteEpicDraftOnClose", () => {
  it("is false when there is no draftId", () => {
    expect(shouldDeleteEpicDraftOnClose(null, tasks)).toBe(false);
  });
  it("is false when no task has uploaded", () => {
    expect(shouldDeleteEpicDraftOnClose("d1", tasks)).toBe(false);
  });
  it("is true when at least one task uploaded", () => {
    const uploaded = [{ ...tasks[0], uploadedIssueKey: "PROJ-1" }, tasks[1]];
    expect(shouldDeleteEpicDraftOnClose("d1", uploaded)).toBe(true);
  });
});
