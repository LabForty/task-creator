import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReviewerMode } from "@/components/epic/review/ReviewerMode";
import { initReviews } from "@/lib/review/state";
import { epicTaskNamespace, type EpicTask } from "@/lib/epic/tasks";

const tasks: EpicTask[] = [
  { id: "a", title: "Alpha", labels: [], blocks: [], blockedBy: [] },
  { id: "b", title: "Beta", labels: [], blocks: [], blockedBy: [] },
];
const base = {
  epicTitle: "My Epic", epicDescriptionHtml: "<p>desc</p>", tasks,
  reviews: initReviews(["a", "b"]), interference: {},
  refreshKey: 0,
  onSelect: vi.fn(), onEditTasks: vi.fn(), onFinalize: vi.fn(), onTitleChange: vi.fn(), onSetLabels: vi.fn(),
  onAddLink: vi.fn(), onRemoveLink: vi.fn(), onReviewChange: vi.fn(), onDelete: vi.fn(),
};

beforeEach(() => {
  window.localStorage.clear();
  // Seed per-task drafts for the EpicTaskEditor (renders inside the panel).
  for (const t of tasks) {
    window.localStorage.setItem(
      `task-creator:draft:${epicTaskNamespace(t.id)}`,
      JSON.stringify({ title: t.title, description: "", acceptanceCriteria: [], constraints: "", taskType: "story", mode: "single" }),
    );
  }
});

describe("<ReviewerMode>", () => {
  it("renders epic preview, nav, a disabled Finalize, and the selected task panel", async () => {
    render(<ReviewerMode {...base} selectedId="a" />);
    expect(screen.getByText("My Epic")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: /review navigation/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /finalize/i })).toBeDisabled();
    expect(await screen.findByDisplayValue("Alpha")).toBeInTheDocument();
  });
  it("shows a placeholder when nothing is selected", () => {
    render(<ReviewerMode {...base} selectedId={null} />);
    expect(screen.getByText(/select a task/i)).toBeInTheDocument();
  });
  it("fires onEditTasks", async () => {
    const onEditTasks = vi.fn();
    render(<ReviewerMode {...base} selectedId="a" onEditTasks={onEditTasks} />);
    await userEvent.click(screen.getByRole("button", { name: /back to tabs/i }));
    expect(onEditTasks).toHaveBeenCalled();
  });
  it("shows '← Back to tabs' instead of 'Edit tasks'", () => {
    render(<ReviewerMode {...base} selectedId={null} />);
    expect(screen.getByRole("button", { name: /back to tabs/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^edit tasks$/i })).toBeNull();
  });
});

// Stub MermaidDiagram so jsdom doesn't try to lazy-import mermaid.
vi.mock("@/components/MermaidDiagram", () => ({
  MermaidDiagram: ({ source }: { source: string }) => <pre data-testid="md-source">{source}</pre>,
}));

it("renders the TaskGraph when tasks exist and removes the placeholder", () => {
  render(
    <ReviewerMode
      epicTitle="E"
      epicDescriptionHtml=""
      tasks={[{ id: "a", title: "Alpha", labels: [], blocks: [], blockedBy: [] }]}
      reviews={{}}
      interference={{}}
      selectedId={null}
      refreshKey={0}
      onSelect={() => {}}
      onEditTasks={() => {}}
      onFinalize={() => {}}
      onTitleChange={() => {}}
      onSetLabels={() => {}}
      onAddLink={() => {}}
      onRemoveLink={() => {}}
      onReviewChange={() => {}}
      onDelete={() => {}}
    />,
  );
  expect(screen.queryByText(/diagram from tasks arrives in a later phase\./i)).toBeNull();
  expect(screen.getByTestId("md-source").textContent ?? "").toContain("t_a[\"Alpha\"]");
});

it("Finalize is disabled when not all tasks are approved/denied", () => {
  render(
    <ReviewerMode
      epicTitle="E"
      epicDescriptionHtml=""
      tasks={[{ id: "a", title: "Alpha", labels: [], blocks: [], blockedBy: [] }]}
      reviews={{ a: { status: "pending", comment: "", assignee: null } }}
      interference={{}}
      selectedId={null}
      refreshKey={0}
      onSelect={() => {}}
      onEditTasks={() => {}}
      onFinalize={() => {}}
      onTitleChange={() => {}}
      onSetLabels={() => {}}
      onAddLink={() => {}}
      onRemoveLink={() => {}}
      onReviewChange={() => {}}
      onDelete={() => {}}
    />,
  );
  expect(screen.getByRole("button", { name: /^finalize$/i })).toBeDisabled();
});

it("Finalize is enabled and fires onFinalize when every task is approved or denied", async () => {
  const onFinalize = vi.fn();
  render(
    <ReviewerMode
      epicTitle="E"
      epicDescriptionHtml=""
      tasks={[
        { id: "a", title: "Alpha", labels: [], blocks: [], blockedBy: [] },
        { id: "b", title: "Bravo", labels: [], blocks: [], blockedBy: [] },
      ]}
      reviews={{
        a: { status: "approved", comment: "", assignee: null },
        b: { status: "denied", comment: "", assignee: null },
      }}
      interference={{}}
      selectedId={null}
      refreshKey={0}
      onSelect={() => {}}
      onEditTasks={() => {}}
      onFinalize={onFinalize}
      onTitleChange={() => {}}
      onSetLabels={() => {}}
      onAddLink={() => {}}
      onRemoveLink={() => {}}
      onReviewChange={() => {}}
      onDelete={() => {}}
    />,
  );
  const btn = screen.getByRole("button", { name: /^finalize$/i });
  expect(btn).not.toBeDisabled();
  await userEvent.click(btn);
  expect(onFinalize).toHaveBeenCalledTimes(1);
});
