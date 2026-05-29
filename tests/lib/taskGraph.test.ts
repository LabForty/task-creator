import { describe, it, expect } from "vitest";
import { buildTaskGraphMermaid } from "@/lib/epic/taskGraph";
import type { EpicTask } from "@/lib/epic/tasks";

describe("buildTaskGraphMermaid", () => {
  it("returns empty string for empty input", () => {
    expect(buildTaskGraphMermaid({ tasks: [] })).toBe("");
  });

  it("emits one node per task with the task classDef", () => {
    const tasks: EpicTask[] = [
      { id: "a", title: "Alpha", labels: [], blocks: [], blockedBy: [] },
    ];
    const out = buildTaskGraphMermaid({ tasks });
    expect(out).toMatch(/graph TD/);
    expect(out).toMatch(/classDef\s+task/);
    expect(out).toMatch(/t_a\["Alpha"\]:::task/);
  });

  it("emits a directed edge for each blocks link", () => {
    const tasks: EpicTask[] = [
      { id: "a", title: "A", labels: [], blocks: ["b"], blockedBy: [] },
      { id: "b", title: "B", labels: [], blocks: [], blockedBy: ["a"] },
    ];
    const out = buildTaskGraphMermaid({ tasks });
    expect(out).toMatch(/t_a\s*-->\s*t_b/);
  });

  it("includes assignee on a second line when provided", () => {
    const tasks: EpicTask[] = [
      { id: "a", title: "Ship it", labels: [], blocks: [], blockedBy: [] },
    ];
    const out = buildTaskGraphMermaid({ tasks, assignees: { a: "Alice" } });
    expect(out).toMatch(/t_a\["Ship it<br\/>\(Alice\)"\]/);
  });

  it("escapes HTML-significant chars in titles", () => {
    const tasks: EpicTask[] = [
      { id: "a", title: 'Has "quotes" & <brackets>', labels: [], blocks: [], blockedBy: [] },
    ];
    const out = buildTaskGraphMermaid({ tasks });
    expect(out).toMatch(/t_a\["Has #quot;quotes#quot; #amp; #lt;brackets#gt;"\]/);
  });

  it("truncates long titles to 40 chars with ellipsis", () => {
    const tasks: EpicTask[] = [
      { id: "a", title: "x".repeat(60), labels: [], blocks: [], blockedBy: [] },
    ];
    const out = buildTaskGraphMermaid({ tasks });
    expect(out).toMatch(/t_a\["x{39}…"\]/);
  });

  it("emits an init directive with flowchart spacing settings", () => {
    const tasks: EpicTask[] = [{ id: "a", title: "A", labels: [], blocks: [], blockedBy: [] }];
    const out = buildTaskGraphMermaid({ tasks });
    expect(out).toMatch(/%%\{init:\s*\{\s*'flowchart':\s*\{[^}]*'useMaxWidth':\s*true/);
    expect(out).toMatch(/'nodeSpacing':\s*28/);
    expect(out).toMatch(/'rankSpacing':\s*40/);
  });
});
