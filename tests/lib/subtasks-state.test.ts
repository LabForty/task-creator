import { describe, it, expect } from "vitest";
import {
  fromProposed, newSubtask, addSubtask, deleteSubtask, updateSubtask,
  setLabels, addLink, removeLink,
} from "@/lib/subtasks/state";

describe("fromProposed", () => {
  it("assigns ids and resolves blocks indices into symmetric links", () => {
    const list = fromProposed([
      { title: "A", description: "", labels: [], blocks: [1] },
      { title: "B", description: "", labels: [], blocks: [] },
    ]);
    expect(list).toHaveLength(2);
    expect(list[0].blocks).toEqual([list[1].id]);
    expect(list[1].blockedBy).toEqual([list[0].id]);
  });
  it("clamps description and ignores self-links", () => {
    const list = fromProposed([{ title: "A", description: "x".repeat(2000), labels: [], blocks: [0] }]);
    expect(list[0].description).toHaveLength(1500);
    expect(list[0].blocks).toEqual([]);
  });
});

describe("reducer ops", () => {
  it("addSubtask appends a blank sub-task", () => {
    const list = addSubtask([]);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ title: "", description: "", labels: [], blocks: [], blockedBy: [] });
    expect(list[0].id).toBeTruthy();
  });
  it("deleteSubtask removes it and strips dangling links", () => {
    let list = fromProposed([{ title: "A", description: "", labels: [], blocks: [1] }, { title: "B", description: "", labels: [], blocks: [] }]);
    const bId = list[1].id;
    list = deleteSubtask(list, bId);
    expect(list).toHaveLength(1);
    expect(list[0].blocks).toEqual([]);
  });
  it("updateSubtask patches fields and clamps description to 1500", () => {
    let list = addSubtask([]);
    const id = list[0].id;
    list = updateSubtask(list, id, { title: "New", description: "y".repeat(2000) });
    expect(list[0].title).toBe("New");
    expect(list[0].description).toHaveLength(1500);
  });
  it("setLabels dedupes", () => {
    let list = addSubtask([]);
    list = setLabels(list, list[0].id, ["a", "A", "b"]);
    expect(list[0].labels).toEqual(["a", "b"]);
  });
  it("addLink keeps blocks/blockedBy symmetric and ignores self + dup", () => {
    let list = addSubtask(addSubtask([]));
    const [a, b] = [list[0].id, list[1].id];
    list = addLink(list, a, b);
    expect(list[0].blocks).toEqual([b]);
    expect(list[1].blockedBy).toEqual([a]);
    list = addLink(list, a, b); // dup
    expect(list[0].blocks).toEqual([b]);
    list = addLink(list, a, a); // self
    expect(list[0].blocks).toEqual([b]);
  });
  it("removeLink removes both directions", () => {
    let list = addSubtask(addSubtask([]));
    const [a, b] = [list[0].id, list[1].id];
    list = addLink(list, a, b);
    list = removeLink(list, a, b);
    expect(list[0].blocks).toEqual([]);
    expect(list[1].blockedBy).toEqual([]);
  });
});
