import { describe, it, expect } from "vitest";
import type { EpicTask } from "@/lib/epic/tasks";
import {
  setReviewStatus, setReviewComment, isReviewComplete, tasksForUpload, deniedTasks,
} from "@/lib/epic/review";

function task(id: string, over: Partial<EpicTask> = {}): EpicTask {
  return { id, title: id.toUpperCase(), labels: [], blocks: [], blockedBy: [], ...over };
}

describe("review helpers", () => {
  it("setReviewStatus sets only the target task and is immutable", () => {
    const list = [task("a"), task("b")];
    const next = setReviewStatus(list, "a", "approved");
    expect(next).not.toBe(list);
    expect(next[0].reviewStatus).toBe("approved");
    expect(next[1].reviewStatus).toBeUndefined();
    expect(list[0].reviewStatus).toBeUndefined(); // original untouched
  });

  it("setReviewComment sets only the target task", () => {
    const next = setReviewComment([task("a"), task("b")], "b", "needs work");
    expect(next[1].reviewComment).toBe("needs work");
    expect(next[0].reviewComment).toBeUndefined();
  });

  it("isReviewComplete is false for an empty list", () => {
    expect(isReviewComplete([])).toBe(false);
  });

  it("isReviewComplete is false when any task is unreviewed or change_requested", () => {
    expect(isReviewComplete([task("a", { reviewStatus: "approved" }), task("b")])).toBe(false);
    expect(isReviewComplete([
      task("a", { reviewStatus: "approved" }),
      task("b", { reviewStatus: "change_requested", reviewComment: "x" }),
    ])).toBe(false);
  });

  it("isReviewComplete is true when every task is approved or denied", () => {
    expect(isReviewComplete([
      task("a", { reviewStatus: "approved" }),
      task("b", { reviewStatus: "denied" }),
    ])).toBe(true);
  });

  it("tasksForUpload returns only approved tasks", () => {
    const list = [
      task("a", { reviewStatus: "approved" }),
      task("b", { reviewStatus: "denied" }),
      task("c", { reviewStatus: "change_requested", reviewComment: "x" }),
      task("d"),
    ];
    expect(tasksForUpload(list).map((t) => t.id)).toEqual(["a"]);
  });

  it("deniedTasks returns id+title for denied tasks", () => {
    const list = [task("a", { reviewStatus: "approved" }), task("b", { reviewStatus: "denied" })];
    expect(deniedTasks(list)).toEqual([{ id: "b", title: "B" }]);
  });
});
