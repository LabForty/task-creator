import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EpicTaskCard } from "@/components/epic/EpicTaskCard";

describe("<EpicTaskCard>", () => {
  it("renders title and description preview", () => {
    render(
      <EpicTaskCard
        kind="task"
        title="Alpha"
        descriptionPreview="A short description."
        active={false}
        onSelect={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText(/short description/i)).toBeInTheDocument();
  });

  it("fires onSelect when the card body is clicked", async () => {
    const onSelect = vi.fn();
    render(
      <EpicTaskCard
        kind="task"
        title="A"
        descriptionPreview=""
        active={false}
        onSelect={onSelect}
        onDelete={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /A.*open task/i }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("inline-confirms delete and fires onDelete only after Yes", async () => {
    const onDelete = vi.fn();
    render(
      <EpicTaskCard
        kind="task"
        title="A"
        descriptionPreview=""
        active={false}
        onSelect={() => {}}
        onDelete={onDelete}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /delete task/i }));
    expect(screen.getByText(/delete\?/i)).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /^yes$/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("does not render delete on the Epic card", () => {
    render(
      <EpicTaskCard
        kind="epic"
        title="My Epic"
        descriptionPreview=""
        active={true}
        onSelect={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: /delete task/i })).toBeNull();
  });

  it("shows bake state chip when set", () => {
    render(
      <EpicTaskCard
        kind="task"
        title="A"
        descriptionPreview=""
        active={false}
        bakeState="baking"
        onSelect={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText(/baking/i)).toBeInTheDocument();
  });
});
