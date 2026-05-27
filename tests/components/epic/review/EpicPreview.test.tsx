import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EpicPreview } from "@/components/epic/review/EpicPreview";
import type { SubTask } from "@/lib/subtasks/types";

const subtasks: SubTask[] = [
  { id: "a", title: "Alpha", description: "", labels: [], blocks: [], blockedBy: [] },
  { id: "b", title: "Beta", description: "", labels: [], blocks: [], blockedBy: [] },
];

describe("<EpicPreview>", () => {
  it("renders the title, description html, and task titles", () => {
    render(<EpicPreview title="My Epic" descriptionHtml="<p>Hello <strong>world</strong></p>" subtasks={subtasks} />);
    expect(screen.getByText("My Epic")).toBeInTheDocument();
    expect(screen.getByText("world")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText(/tasks \(2\)/i)).toBeInTheDocument();
  });
});
