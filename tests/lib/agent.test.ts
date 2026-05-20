import { describe, it, expect, vi } from "vitest";
import { runAnalyst, runPlanner, makeDefaultTransport, makeStubTransport, makeTransport } from "@/lib/agent";
import type { AgentTransport } from "@/lib/agent/types";

function textTransport(text: string): AgentTransport {
  return {
    async runRole({ onEvent }) {
      onEvent({ type: "progress", message: "starting" });
      onEvent({ type: "token", text });
    },
  };
}

function errorTransport(code: string, message: string): AgentTransport {
  return {
    async runRole({ onEvent }) {
      onEvent({ type: "error", code, message, retriable: false });
    },
  };
}

const validRequirementJson = JSON.stringify({
  title: "Export users as CSV",
  summary: "Operators can download the user table as a CSV.",
  problem: "Audit handoffs require slow manual SQL dumps today.",
  value: "Cuts audit handoff time and removes manual-export errors.",
  acceptanceCriteria: ["Returns 200 with a CSV body"],
  outOfScope: [],
  dependencies: [],
  risks: [],
});

const validStoryJson = JSON.stringify({
  title: "Export users as CSV",
  userStory: {
    asA: "operator",
    iWant: "download the user table as a CSV",
    soThat: "hand it to auditors",
  },
  scope: ["GET /api/users/export"],
  requirements: [
    { category: "Endpoint", items: ["Add GET /api/users/export returning CSV"] },
  ],
  acceptanceCriteria: ["Returns 200 with a CSV body", "Returns 401 with no session"],
  outOfScope: [],
});

describe("lib/agent", () => {
  it("runAnalyst parses a valid JSON requirement and publishes started/finished events", async () => {
    const publish = vi.fn();
    const result = await runAnalyst({
      draft: { title: "T", description: "D" },
      transport: textTransport(validRequirementJson),
      publish,
    });
    expect(result.requirement.title).toBe("Export users as CSV");
    const types = publish.mock.calls.map((c) => c[0].type);
    expect(types).toContain("role_started");
    expect(types).toContain("role_finished");
  });

  it("runAnalyst throws with gateErrors when the JSON fails Zod validation", async () => {
    const bad = JSON.stringify({ title: "x" }); // missing required fields
    const publish = vi.fn();
    await expect(
      runAnalyst({
        draft: { title: "T", description: "D" },
        transport: textTransport(bad),
        publish,
      }),
    ).rejects.toMatchObject({ gateErrors: expect.any(Array) });
  });

  it("runPlanner parses a valid JSON story when given a requirement", async () => {
    const publish = vi.fn();
    const requirement = JSON.parse(validRequirementJson);
    const result = await runPlanner({
      requirement,
      draft: { title: "T", description: "D" },
      transport: textTransport(validStoryJson),
      publish,
    });
    expect(result.story.title).toBe("Export users as CSV");
    expect(result.story.acceptanceCriteria[0]).toBe("Returns 200 with a CSV body");
    expect(result.story.requirements[0].category).toBe("Endpoint");
  });

  it("an error event from the transport publishes an error JobEvent and rejects", async () => {
    const publish = vi.fn();
    await expect(
      runAnalyst({
        draft: { title: "T", description: "D" },
        transport: errorTransport("E_AUTH", "401"),
        publish,
      }),
    ).rejects.toThrow(/E_AUTH/);
    expect(publish).toHaveBeenCalledWith({ type: "error", code: "E_AUTH", message: "401", retriable: false });
  });

  it("makeDefaultTransport returns an object with a runRole function", () => {
    const t = makeDefaultTransport();
    expect(typeof t.runRole).toBe("function");
  });

  it("makeStubTransport produces valid analyst + planner JSON when invoked", async () => {
    const stub = makeStubTransport();
    let analystOut = "";
    await stub.runRole({
      role: "analyst",
      systemPrompt: "",
      userMessage: "",
      cwd: process.cwd(),
      onEvent: (e) => {
        if (e.type === "token") analystOut += e.text;
      },
    });
    expect(() => JSON.parse(analystOut)).not.toThrow();
    const parsed = JSON.parse(analystOut);
    expect(parsed.title).toBeTruthy();
    expect(Array.isArray(parsed.acceptanceCriteria)).toBe(true);
  });

  it("makeTransport returns the stub transport when TASK_AGENT_MODE=stub", () => {
    const prev = process.env.TASK_AGENT_MODE;
    process.env.TASK_AGENT_MODE = "stub";
    try {
      const t = makeTransport();
      expect(typeof t.runRole).toBe("function");
    } finally {
      if (prev === undefined) delete process.env.TASK_AGENT_MODE;
      else process.env.TASK_AGENT_MODE = prev;
    }
  });
});
