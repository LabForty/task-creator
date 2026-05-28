import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EpicPreview } from "@/components/epic/review/EpicPreview";
import type { EpicTask } from "@/lib/epic/tasks";

const tasks: EpicTask[] = [
  { id: "a", title: "Alpha", labels: [], blocks: [], blockedBy: [] },
  { id: "b", title: "Beta", labels: [], blocks: [], blockedBy: [] },
];

describe("<EpicPreview>", () => {
  it("renders the title, description html, and task titles", () => {
    render(<EpicPreview title="My Epic" descriptionHtml="<p>Hello <strong>world</strong></p>" tasks={tasks} />);
    expect(screen.getByText("My Epic")).toBeInTheDocument();
    expect(screen.getByText("world")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText(/tasks \(2\)/i)).toBeInTheDocument();
  });
});
