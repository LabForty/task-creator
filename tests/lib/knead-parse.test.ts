import { describe, it, expect } from "vitest";
import { parseKneadResponse, applyCap } from "@/lib/knead/parse";

const questionsJson = JSON.stringify({
  kind: "questions",
  questions: [
    { id: "q1", prompt: "Which surfaces?", section: "business", type: "multi", options: ["Web", "API"] },
    { id: "q2", prompt: "Rollout risk?", section: "technical", type: "single", options: ["Low", "High"] },
    { id: "q3", prompt: "Describe the value", section: "business", type: "text" },
  ],
});

describe("parseKneadResponse", () => {
  it("parses a valid questions payload", () => {
    const r = parseKneadResponse(questionsJson);
    expect(r.kind).toBe("questions");
    if (r.kind === "questions") expect(r.questions).toHaveLength(3);
  });

  it("parses a complete payload", () => {
    expect(parseKneadResponse('{"kind":"complete"}')).toEqual({ kind: "complete" });
  });

  it("tolerates markdown fences and surrounding prose", () => {
    const wrapped = "Here you go:\n```json\n" + questionsJson + "\n```";
    expect(parseKneadResponse(wrapped).kind).toBe("questions");
  });

  it("truncates a round to 25 questions", () => {
    const many = {
      kind: "questions",
      questions: Array.from({ length: 40 }, (_, i) => ({
        id: `q${i}`, prompt: `Q${i}`, section: "business", type: "text",
      })),
    };
    const r = parseKneadResponse(JSON.stringify(many));
    if (r.kind === "questions") expect(r.questions).toHaveLength(25);
  });

  it("rejects a single/multi question with no options", () => {
    const bad = JSON.stringify({
      kind: "questions",
      questions: [{ id: "q1", prompt: "Pick", section: "business", type: "single" }],
    });
    expect(() => parseKneadResponse(bad)).toThrow(/options/i);
  });

  it("rejects output with no JSON object", () => {
    expect(() => parseKneadResponse("sorry, no json here")).toThrow(/JSON/i);
  });
});

describe("applyCap", () => {
  const result = { kind: "questions", questions: [{ id: "q1", prompt: "P", section: "business", type: "text" }] } as const;

  it("returns questions for rounds below the cap", () => {
    expect(applyCap(result, 0, false)).toEqual({ kind: "questions", round: { questions: result.questions } });
    expect(applyCap(result, 4, false)).toEqual({ kind: "questions", round: { questions: result.questions } });
  });

  it("returns cap_reached at the 6th round without approval", () => {
    const out = applyCap(result, 5, false);
    expect(out.kind).toBe("cap_reached");
    if (out.kind === "cap_reached") expect(out.justification).toBeTruthy();
  });

  it("uses the model's justification when present", () => {
    const withJust = { ...result, justification: "Auth model still unclear." };
    const out = applyCap(withJust, 5, false);
    if (out.kind === "cap_reached") expect(out.justification).toBe("Auth model still unclear.");
  });

  it("returns questions past the cap once override is approved", () => {
    expect(applyCap(result, 5, true).kind).toBe("questions");
  });

  it("always passes through a complete result", () => {
    expect(applyCap({ kind: "complete" }, 9, false)).toEqual({ kind: "complete" });
  });
});
