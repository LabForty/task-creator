import { describe, it, expect } from "vitest";
import { runKnead, makeStubTransport } from "@/lib/agent";
import type { AgentTransport } from "@/lib/agent/types";

function textTransport(text: string): AgentTransport {
  return {
    async runRole({ onEvent }) {
      onEvent({ type: "token", text });
    },
  };
}

describe("runKnead", () => {
  it("returns a questions outcome from a valid model reply", async () => {
    const reply = JSON.stringify({
      kind: "questions",
      questions: [{ id: "q1", prompt: "P", section: "business", type: "text" }],
    });
    const out = await runKnead({ epicDescription: "Epic", rounds: [], transport: textTransport(reply) });
    expect(out.kind).toBe("questions");
    if (out.kind === "questions") expect(out.round.questions[0].id).toBe("q1");
  });

  it("maps a complete reply to a complete outcome on rounds >= 1", async () => {
    // After Task 3 (AI-36), `complete` on rounds: [] is intercepted by the
    // "must ask >=1 round" guard. Pass a single answered round so the guard
    // skips and the model's `complete` flows through unchanged.
    const out = await runKnead({
      epicDescription: "Epic",
      rounds: [{ questions: [{ id: "q1", prompt: "P", section: "business", type: "text" }], answers: { q1: "yes" } }],
      transport: textTransport('{"kind":"complete"}'),
    });
    expect(out.kind).toBe("complete");
  });

  it("returns cap_reached when 5 rounds are already answered and no override", async () => {
    const reply = JSON.stringify({
      kind: "questions",
      questions: [{ id: "q1", prompt: "P", section: "business", type: "text" }],
      justification: "Need more.",
    });
    const fiveRounds = Array.from({ length: 5 }, () => ({ questions: [], answers: {} }));
    const out = await runKnead({ epicDescription: "Epic", rounds: fiveRounds, transport: textTransport(reply) });
    expect(out.kind).toBe("cap_reached");
  });

  it("stub transport returns a round 1, then complete", async () => {
    const stub = makeStubTransport();
    const collect = async (rounds: unknown[]) => {
      let buf = "";
      await stub.runRole({
        role: "knead",
        systemPrompt: "",
        userMessage: JSON.stringify({ rounds }),
        cwd: process.cwd(),
        onEvent: (e) => {
          if (e.type === "token") buf += e.text;
        },
      });
      return JSON.parse(buf);
    };
    expect((await collect([])).kind).toBe("questions");
    expect((await collect([{ questions: [], answers: {} }])).kind).toBe("complete");
  });
});
