import { describe, it, expect, vi } from "vitest";
import { runCreateDiagrams } from "@/lib/agent";
import type { AgentTransport } from "@/lib/agent/types";
import type { Requirement, Story } from "@/lib/pipeline";
import type { Draft } from "@/lib/draft/autosave";

const req: Requirement = {
  title: "Export users CSV",
  summary: "Operators can download the user table as a CSV.",
  problem: "Audit handoffs require manual SQL dumps today.",
  value: "Reduces audit handoff time.",
  acceptanceCriteria: ["Returns 200 with a CSV body"],
  outOfScope: [],
  dependencies: [],
  risks: [],
};

const story: Story = {
  title: "Implement /export/users",
  userStory: {
    asA: "operator",
    iWant: "download the user table",
    soThat: "hand it to auditors",
  },
  scope: ["GET /export/users"],
  requirements: [{ category: "Endpoint", items: ["Add GET /export/users returning CSV"] }],
  acceptanceCriteria: ["Returns 200 with CSV body"],
  outOfScope: [],
};

const draft: Draft = {
  title: "Export users",
  description: "x",
  acceptanceCriteria: [],
  constraints: "",
};

function bufferedTransport(reply: string): AgentTransport {
  return {
    async runRole({ onEvent }) {
      onEvent({ type: "progress", message: "starting" });
      onEvent({ type: "token", text: reply });
    },
  };
}

describe("lib/agent.runCreateDiagrams", () => {
  it("loads the create-diagrams skill prompt and posts the model's JSON output as diagrams", async () => {
    const reply = JSON.stringify({
      flow: "flowchart TD; A-->B",
      sequence: "sequenceDiagram; A->>B: hi",
      interaction: "graph LR; X --> Y",
    });
    const publish = vi.fn();
    const result = await runCreateDiagrams({
      requirement: req,
      story,
      draft,
      transport: bufferedTransport(reply),
      publish,
    });
    expect(result.flow).toContain("flowchart");
    expect(result.sequence).toContain("sequenceDiagram");
    expect(result.interaction).toContain("graph");
    expect(publish).toHaveBeenCalledWith({ type: "diagrams_created", payload: result });
  });

  it("strips a ```json fenced wrapper from the model's response", async () => {
    const reply = "```json\n" + JSON.stringify({ flow: "flowchart TD; A-->B" }) + "\n```";
    const publish = vi.fn();
    const result = await runCreateDiagrams({
      requirement: req,
      story,
      draft,
      transport: bufferedTransport(reply),
      publish,
    });
    expect(result.flow).toContain("flowchart");
  });

  it("respects the explicit `formats` request by passing it in the user message", async () => {
    let capturedUserMessage = "";
    const transport: AgentTransport = {
      async runRole({ userMessage, onEvent }) {
        capturedUserMessage = userMessage;
        onEvent({ type: "token", text: JSON.stringify({ flow: "flowchart TD; A-->B" }) });
      },
    };
    await runCreateDiagrams({
      requirement: req,
      story,
      draft,
      formats: ["flow"],
      transport,
      publish: vi.fn(),
    });
    expect(capturedUserMessage).toContain('"formats":["flow"]');
  });

  it("throws when the model output is not valid JSON", async () => {
    const transport = bufferedTransport("not json at all");
    await expect(
      runCreateDiagrams({ requirement: req, story, draft, transport, publish: vi.fn() }),
    ).rejects.toThrow(/not valid JSON/);
  });

  it("publishes the transport's error and rejects", async () => {
    const transport: AgentTransport = {
      async runRole({ onEvent }) {
        onEvent({ type: "error", code: "E_AUTH", message: "401", retriable: false });
      },
    };
    const publish = vi.fn();
    await expect(
      runCreateDiagrams({ requirement: req, story, draft, transport, publish }),
    ).rejects.toThrow(/E_AUTH/);
    expect(publish).toHaveBeenCalledWith({
      type: "error",
      code: "E_AUTH",
      message: "401",
      retriable: false,
    });
  });
});
