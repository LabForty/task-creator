import { describe, it, expect } from "vitest";
import { buildTaskGraphMermaid } from "@/lib/epic/taskGraph";
import type { EpicTask } from "@/lib/epic/tasks";
import type { ReviewMap } from "@/lib/review/types";

const blank: ReviewMap = {};

describe("buildTaskGraphMermaid", () => {
  it("returns empty string for empty input", () => {
    expect(buildTaskGraphMermaid({ tasks: [], reviews: blank })).toBe("");
  });

  it("emits one node per task with classDef declarations", () => {
    const tasks: EpicTask[] = [
      { id: "a", title: "Alpha", labels: [], blocks: [], blockedBy: [] },
    ];
    const out = buildTaskGraphMermaid({ tasks, reviews: blank });
    expect(out).toMatch(/graph TD/);
    expect(out).toMatch(/classDef\s+approved/);
    expect(out).toMatch(/classDef\s+denied/);
    expect(out).toMatch(/classDef\s+change_requested/);
    expect(out).toMatch(/classDef\s+pending/);
    expect(out).toMatch(/t_a\["Alpha"\]:::pending/);
  });

  it("colors nodes by review status", () => {
    const tasks: EpicTask[] = [
      { id: "a", title: "A", labels: [], blocks: [], blockedBy: [] },
      { id: "b", title: "B", labels: [], blocks: [], blockedBy: [] },
      { id: "c", title: "C", labels: [], blocks: [], blockedBy: [] },
      { id: "d", title: "D", labels: [], blocks: [], blockedBy: [] },
    ];
    const reviews: ReviewMap = {
      a: { status: "approved", comment: "", assignee: null },
      b: { status: "denied", comment: "", assignee: null },
      c: { status: "change_requested", comment: "fix x", assignee: null },
      d: { status: "pending", comment: "", assignee: null },
    };
    const out = buildTaskGraphMermaid({ tasks, reviews });
    expect(out).toMatch(/t_a\[.*\]:::approved/);
    expect(out).toMatch(/t_b\[.*\]:::denied/);
    expect(out).toMatch(/t_c\[.*\]:::change_requested/);
    expect(out).toMatch(/t_d\[.*\]:::pending/);
  });

  it("emits a directed edge for each blocks link", () => {
    const tasks: EpicTask[] = [
      { id: "a", title: "A", labels: [], blocks: ["b"], blockedBy: [] },
      { id: "b", title: "B", labels: [], blocks: [], blockedBy: ["a"] },
    ];
    const out = buildTaskGraphMermaid({ tasks, reviews: blank });
    expect(out).toMatch(/t_a\s*-->\s*t_b/);
  });

  it("includes assignee on a second line when provided", () => {
    const tasks: EpicTask[] = [
      { id: "a", title: "Ship it", labels: [], blocks: [], blockedBy: [] },
    ];
    const out = buildTaskGraphMermaid({ tasks, reviews: blank, assignees: { a: "Alice" } });
    expect(out).toMatch(/t_a\["Ship it<br\/>\(Alice\)"\]/);
  });

  it("escapes HTML-significant chars in titles", () => {
    const tasks: EpicTask[] = [
      { id: "a", title: 'Has "quotes" & <brackets>', labels: [], blocks: [], blockedBy: [] },
    ];
    const out = buildTaskGraphMermaid({ tasks, reviews: blank });
    // Quote -> #quot; entity; & -> #amp;; < / > -> #lt; #gt;
    expect(out).toMatch(/t_a\["Has #quot;quotes#quot; #amp; #lt;brackets#gt;"\]/);
  });

  it("truncates long titles to 40 chars with ellipsis", () => {
    const tasks: EpicTask[] = [
      { id: "a", title: "x".repeat(60), labels: [], blocks: [], blockedBy: [] },
    ];
    const out = buildTaskGraphMermaid({ tasks, reviews: blank });
    expect(out).toMatch(/t_a\["x{39}…"\]/);
  });

  it("emits an init directive with flowchart spacing settings", () => {
    const tasks: EpicTask[] = [{ id: "a", title: "A", labels: [], blocks: [], blockedBy: [] }];
    const out = buildTaskGraphMermaid({ tasks, reviews: blank });
    expect(out).toMatch(/%%\{init:\s*\{\s*'flowchart':\s*\{[^}]*'useMaxWidth':\s*true/);
    expect(out).toMatch(/'nodeSpacing':\s*28/);
    expect(out).toMatch(/'rankSpacing':\s*40/);
  });
});
