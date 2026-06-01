import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BakeNav } from "@/components/epic/bake/BakeNav";

const tasks = [
  { id: "a", title: "Alpha", labels: [], blocks: [], blockedBy: [], reviewStatus: "approved" as const, reviewComment: "looks good" },
  { id: "b", title: "Bravo", labels: [], blocks: [], blockedBy: [], reviewStatus: "denied" as const },
];

const base = {
  tasks,
  selectedId: "epic" as const,
  finalizedIds: new Set(["a", "b"]),
  failedIds: {} as Record<string, string>,
  onSelect: () => {},
  onUploadAll: () => {},
  onBackToEditing: () => {},
};

describe("<BakeNav>", () => {
  it("renders Epic overview + one entry per task", () => {
    render(<BakeNav {...base} />);
    expect(screen.getByRole("button", { name: /epic overview/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Alpha/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Bravo/ })).toBeInTheDocument();
  });

  it("fires onSelect with the right id", async () => {
    const onSelect = vi.fn();
    render(<BakeNav {...base} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: /Alpha/ }));
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("Upload all fires onUploadAll", async () => {
    const onUploadAll = vi.fn();
    render(<BakeNav {...base} onUploadAll={onUploadAll} />);
    await userEvent.click(screen.getByRole("button", { name: /upload all to jira/i }));
    expect(onUploadAll).toHaveBeenCalledTimes(1);
  });

  it("Back to editing fires onBackToEditing", async () => {
    const onBackToEditing = vi.fn();
    render(<BakeNav {...base} onBackToEditing={onBackToEditing} />);
    await userEvent.click(screen.getByRole("button", { name: /back to editing/i }));
    expect(onBackToEditing).toHaveBeenCalledTimes(1);
  });

  it("shows a status color dot per task", () => {
    render(<BakeNav {...base} />);
    expect(screen.getByLabelText(/approved/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/denied/i)).toBeInTheDocument();
  });

  it("shows a comment marker when a task has a comment", () => {
    render(<BakeNav {...base} />);
    // Alpha has a comment, Bravo does not.
    expect(screen.getAllByLabelText(/has comment/i)).toHaveLength(1);
  });

  it("disables Upload all and shows the hint when uploadDisabled", () => {
    render(<BakeNav {...base} uploadDisabled />);
    expect(screen.getByRole("button", { name: /upload all to jira/i })).toBeDisabled();
    expect(screen.getByText(/review all the tasks and resolve requested changes/i)).toBeInTheDocument();
  });

  it("enables Upload all when not disabled", () => {
    render(<BakeNav {...base} uploadDisabled={false} />);
    expect(screen.getByRole("button", { name: /upload all to jira/i })).toBeEnabled();
  });
});
