import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EpicTabBar } from "@/components/epic/EpicTabBar";

const tasks = [{ id: "a", title: "Alpha" }, { id: "b", title: "" }];

describe("<EpicTabBar>", () => {
  it("renders an Epic tab + one tab per task (untitled fallback) + an add control", () => {
    render(<EpicTabBar tasks={tasks} active="epic" onSelect={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByRole("tab", { name: /^epic$/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /alpha/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /untitled/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add (a )?task/i })).toBeInTheDocument();
  });
  it("selects a tab and adds", async () => {
    const onSelect = vi.fn(); const onAdd = vi.fn();
    render(<EpicTabBar tasks={tasks} active="epic" onSelect={onSelect} onAdd={onAdd} />);
    await userEvent.click(screen.getByRole("tab", { name: /alpha/i }));
    expect(onSelect).toHaveBeenCalledWith("a");
    await userEvent.click(screen.getByRole("button", { name: /add (a )?task/i }));
    expect(onAdd).toHaveBeenCalled();
  });
});
