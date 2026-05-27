import { describe, it, expect } from "vitest";
import {
  startInterview, appendRound, setAnswer, markComplete, resetDough,
  currentRound, isCurrentRoundAnswered, isAnswered,
  skipQuestion, unskipQuestion, isSkipped,
} from "@/lib/epic/state";
import { EMPTY_KNEAD, type KneadQuestion } from "@/lib/knead/types";

const qs: KneadQuestion[] = [
  { id: "a", prompt: "A", section: "business", type: "text" },
  { id: "b", prompt: "B", section: "technical", type: "multi", options: ["x", "y"] },
];

describe("isAnswered", () => {
  it("text needs non-empty trimmed value", () => {
    expect(isAnswered({ id: "a", prompt: "A", section: "business", type: "text" }, "")).toBe(false);
    expect(isAnswered({ id: "a", prompt: "A", section: "business", type: "text" }, "  ")).toBe(false);
    expect(isAnswered({ id: "a", prompt: "A", section: "business", type: "text" }, "hi")).toBe(true);
  });
  it("multi needs at least one selection", () => {
    const q: KneadQuestion = { id: "b", prompt: "B", section: "business", type: "multi", options: ["x"] };
    expect(isAnswered(q, [])).toBe(false);
    expect(isAnswered(q, ["x"])).toBe(true);
    expect(isAnswered(q, undefined)).toBe(false);
  });
  it("single needs a non-empty chosen option", () => {
    const q: KneadQuestion = { id: "s", prompt: "S", section: "technical", type: "single", options: ["Low", "High"] };
    expect(isAnswered(q, "")).toBe(false);
    expect(isAnswered(q, "Low")).toBe(true);
    expect(isAnswered(q, undefined)).toBe(false);
  });
});

describe("knead state transitions", () => {
  it("startInterview records the source description and clears rounds", () => {
    const s = startInterview(EMPTY_KNEAD, "epic text");
    expect(s.status).toBe("interviewing");
    expect(s.rounds).toEqual([]);
    expect(s.sourceDescription).toBe("epic text");
  });

  it("appendRound adds a round with empty answers", () => {
    const s = appendRound(startInterview(EMPTY_KNEAD, "d"), qs);
    expect(s.rounds).toHaveLength(1);
    expect(currentRound(s)?.questions).toEqual(qs);
    expect(currentRound(s)?.answers).toEqual({});
  });

  it("setAnswer updates the current round only", () => {
    let s = appendRound(startInterview(EMPTY_KNEAD, "d"), qs);
    s = setAnswer(s, "a", "hello");
    expect(currentRound(s)?.answers).toEqual({ a: "hello" });
  });

  it("isCurrentRoundAnswered is true only when every question is answered", () => {
    let s = appendRound(startInterview(EMPTY_KNEAD, "d"), qs);
    expect(isCurrentRoundAnswered(s)).toBe(false);
    s = setAnswer(s, "a", "hello");
    expect(isCurrentRoundAnswered(s)).toBe(false);
    s = setAnswer(s, "b", ["x"]);
    expect(isCurrentRoundAnswered(s)).toBe(true);
  });

  it("markComplete sets status complete and keeps rounds", () => {
    const s = markComplete(appendRound(startInterview(EMPTY_KNEAD, "d"), qs));
    expect(s.status).toBe("complete");
    expect(s.rounds).toHaveLength(1);
  });

  it("resetDough(keep=false) clears rounds back to idle", () => {
    const s = resetDough(appendRound(startInterview(EMPTY_KNEAD, "d"), qs), false);
    expect(s).toEqual(EMPTY_KNEAD);
  });

  it("resetDough(keep=true) keeps answered rounds but returns to idle", () => {
    let s = appendRound(startInterview(EMPTY_KNEAD, "d"), qs);
    s = setAnswer(s, "a", "hi");
    const reset = resetDough(s, true);
    expect(reset.status).toBe("idle");
    expect(reset.rounds).toHaveLength(1);
    expect(currentRound(reset)?.answers).toEqual({ a: "hi" });
  });
});

describe("skip", () => {
  it("skipQuestion marks a question skipped and clears any answer", () => {
    let s = appendRound(startInterview(EMPTY_KNEAD, "d"), qs);
    s = setAnswer(s, "a", "hi");
    s = skipQuestion(s, "a");
    expect(isSkipped(currentRound(s), "a")).toBe(true);
    expect(currentRound(s)?.answers.a).toBeUndefined();
  });

  it("unskipQuestion removes the skip mark", () => {
    let s = appendRound(startInterview(EMPTY_KNEAD, "d"), qs);
    s = skipQuestion(s, "a");
    s = unskipQuestion(s, "a");
    expect(isSkipped(currentRound(s), "a")).toBe(false);
  });

  it("answering a skipped question clears the skip", () => {
    let s = appendRound(startInterview(EMPTY_KNEAD, "d"), qs);
    s = skipQuestion(s, "a");
    s = setAnswer(s, "a", "now answered");
    expect(isSkipped(currentRound(s), "a")).toBe(false);
    expect(currentRound(s)?.answers.a).toBe("now answered");
  });

  it("a round is resolved when remaining questions are skipped", () => {
    let s = appendRound(startInterview(EMPTY_KNEAD, "d"), qs);
    s = setAnswer(s, "a", "hi");
    expect(isCurrentRoundAnswered(s)).toBe(false); // b still open
    s = skipQuestion(s, "b");
    expect(isCurrentRoundAnswered(s)).toBe(true); // a answered, b skipped
  });
});
