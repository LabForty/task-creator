import { describe, it, expect } from "vitest";
import { runGenerateSubtasks, makeStubTransport } from "@/lib/agent";
import type { AgentTransport } from "@/lib/agent/types";

function textTransport(text: string): AgentTransport {
  return { async runRole({ onEvent }) { onEvent({ type: "token", text }); } };
}

describe("runGenerateSubtasks", () => {
  it("returns proposed subtasks from a valid reply", async () => {
    const reply = JSON.stringify({ subtasks: [{ title: "A", description: "d", labels: ["x"], blocks: [] }] });
    const r = await runGenerateSubtasks({ epicDescription: "Epic", rounds: [], transport: textTransport(reply) });
    expect(r).toHaveLength(1);
    expect(r[0].title).toBe("A");
  });

  it("stub transport returns a 2-item proposal with a link", async () => {
    const stub = makeStubTransport();
    let buf = "";
    await stub.runRole({
      role: "generate-subtasks", systemPrompt: "", userMessage: "{}", cwd: process.cwd(),
      onEvent: (e) => { if (e.type === "token") buf += e.text; },
    });
    const parsed = JSON.parse(buf);
    expect(parsed.subtasks.length).toBe(2);
    expect(parsed.subtasks[0].blocks).toEqual([1]);
  });
});
