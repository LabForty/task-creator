import { describe, it, expect } from "vitest";
import { runRefine, makeStubTransport } from "@/lib/agent";
import type { AgentTransport } from "@/lib/agent/types";

function textTransport(text: string): AgentTransport {
  return { async runRole({ onEvent }) { onEvent({ type: "token", text }); } };
}

describe("runRefine", () => {
  it("returns the refined draft fields", async () => {
    const reply = JSON.stringify({ title: "Better", description: "Clearer", acceptanceCriteria: ["x", "y"] });
    const r = await runRefine({ epicDescription: "E", draft: { title: "t", description: "d", acceptanceCriteria: [], constraints: "" }, transport: textTransport(reply) });
    expect(r).toEqual({ title: "Better", description: "Clearer", acceptanceCriteria: ["x", "y"] });
  });
  it("stub returns a deterministic refined draft", async () => {
    const stub = makeStubTransport();
    let buf = "";
    await stub.runRole({ role: "refine", systemPrompt: "", userMessage: "{}", cwd: process.cwd(), onEvent: (e) => { if (e.type === "token") buf += e.text; } });
    const parsed = JSON.parse(buf);
    expect(typeof parsed.title).toBe("string");
    expect(Array.isArray(parsed.acceptanceCriteria)).toBe(true);
  });
});
