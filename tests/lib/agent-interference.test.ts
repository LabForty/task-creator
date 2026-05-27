import { describe, it, expect } from "vitest";
import { runInterferenceAnalysis, makeStubTransport } from "@/lib/agent";
import type { AgentTransport } from "@/lib/agent/types";
import type { SubTask } from "@/lib/subtasks/types";

const a: SubTask = { id: "a", title: "A", description: "", labels: [], blocks: [], blockedBy: [] };
const b: SubTask = { id: "b", title: "B", description: "", labels: [], blocks: [], blockedBy: [] };

function textTransport(text: string): AgentTransport {
  return { async runRole({ onEvent }) { onEvent({ type: "token", text }); } };
}

describe("runInterferenceAnalysis", () => {
  it("returns warnings stamped with sourceTaskId, filtering unknown/self", async () => {
    const reply = JSON.stringify({ interference: [
      { affectedTaskId: "b", reason: "shares API" },
      { affectedTaskId: "a", reason: "self - should be dropped" },
      { affectedTaskId: "zzz", reason: "unknown - dropped" },
    ] });
    const r = await runInterferenceAnalysis({ epicDescription: "E", editedSubtask: a, allSubtasks: [a, b], transport: textTransport(reply) });
    expect(r).toEqual([{ affectedTaskId: "b", sourceTaskId: "a", reason: "shares API" }]);
  });

  it("stub flags the first other task", async () => {
    const stub = makeStubTransport();
    let buf = "";
    await stub.runRole({
      role: "interference", systemPrompt: "", cwd: process.cwd(),
      userMessage: JSON.stringify({ editedSubtask: a, allSubtasks: [a, b] }),
      onEvent: (e) => { if (e.type === "token") buf += e.text; },
    });
    const parsed = JSON.parse(buf);
    expect(parsed.interference[0].affectedTaskId).toBe("b");
  });
});
