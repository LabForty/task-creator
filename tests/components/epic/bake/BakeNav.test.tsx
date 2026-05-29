import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BakeNav } from "@/components/epic/bake/BakeNav";

const tasks = [
  { id: "a", title: "Alpha", labels: [], blocks: [], blockedBy: [] },
  { id: "b", title: "Bravo", labels: [], blocks: [], blockedBy: [] },
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
});
