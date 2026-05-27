import { describe, it, expect } from "vitest";
import {
  newEpicTask, addEpicTask, deleteEpicTask, setTitle, setLabels,
  addLink, removeLink, descriptorsFromProposed,
} from "@/lib/epic/tasks";

describe("epic task descriptors", () => {
  it("descriptorsFromProposed assigns ids and resolves blocks indices symmetrically", () => {
    const list = descriptorsFromProposed([
      { title: "A", description: "", labels: ["x"], blocks: [1] },
      { title: "B", description: "", labels: [], blocks: [] },
    ]);
    expect(list).toHaveLength(2);
    expect(list[0].title).toBe("A");
    expect(list[0].labels).toEqual(["x"]);
    expect(list[0].blocks).toEqual([list[1].id]);
    expect(list[1].blockedBy).toEqual([list[0].id]);
  });
  it("newEpicTask makes a blank descriptor with an id", () => {
    const t = newEpicTask();
    expect(t).toMatchObject({ title: "", labels: [], blocks: [], blockedBy: [] });
    expect(t.id).toBeTruthy();
  });
  it("addEpicTask appends", () => {
    expect(addEpicTask([]).length).toBe(1);
  });
  it("deleteEpicTask removes it and strips dangling links", () => {
    let list = descriptorsFromProposed([{ title: "A", description: "", labels: [], blocks: [1] }, { title: "B", description: "", labels: [], blocks: [] }]);
    list = deleteEpicTask(list, list[1].id);
    expect(list).toHaveLength(1);
    expect(list[0].blocks).toEqual([]);
  });
  it("setTitle / setLabels (dedupe)", () => {
    let list = addEpicTask([]);
    const id = list[0].id;
    list = setTitle(list, id, "New");
    list = setLabels(list, id, ["a", "A", "b"]);
    expect(list[0].title).toBe("New");
    expect(list[0].labels).toEqual(["a", "b"]);
  });
  it("addLink symmetric + ignore self/dup; removeLink both directions", () => {
    let list = addEpicTask(addEpicTask([]));
    const [a, b] = [list[0].id, list[1].id];
    list = addLink(list, a, b);
    expect(list[0].blocks).toEqual([b]);
    expect(list[1].blockedBy).toEqual([a]);
    list = addLink(list, a, b);
    expect(list[0].blocks).toEqual([b]);
    list = addLink(list, a, a);
    expect(list[0].blocks).toEqual([b]);
    list = removeLink(list, a, b);
    expect(list[0].blocks).toEqual([]);
    expect(list[1].blockedBy).toEqual([]);
  });
});
