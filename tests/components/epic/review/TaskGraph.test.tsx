import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TaskGraph } from "@/components/epic/review/TaskGraph";
import type { EpicTask } from "@/lib/epic/tasks";

vi.mock("@/components/MermaidDiagram", () => ({
  MermaidDiagram: ({ source }: { source: string }) => (
    <pre data-testid="mermaid-source">{source}</pre>
  ),
}));

describe("<TaskGraph>", () => {
  it("renders nothing when there are no tasks", () => {
    const { container } = render(<TaskGraph tasks={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the mermaid source produced by the builder when tasks exist", () => {
    const tasks: EpicTask[] = [
      { id: "a", title: "Alpha", labels: [], blocks: [], blockedBy: [] },
    ];
    render(<TaskGraph tasks={tasks} />);
    const src = screen.getByTestId("mermaid-source").textContent ?? "";
    expect(src).toContain("graph TD");
    expect(src).toContain("t_a[\"Alpha\"]");
  });

  it("forwards assignees into the builder so node labels include them", () => {
    const tasks: EpicTask[] = [
      { id: "a", title: "Ship", labels: [], blocks: [], blockedBy: [] },
    ];
    render(<TaskGraph tasks={tasks} assignees={{ a: "Alice" }} />);
    const src = screen.getByTestId("mermaid-source").textContent ?? "";
    expect(src).toContain("Ship<br/>(Alice)");
  });
});
