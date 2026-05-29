import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EpicTaskCards } from "@/components/epic/EpicTaskCards";

describe("<EpicTaskCards>", () => {
  it("renders Epic + one task + Add tile", () => {
    render(
      <EpicTaskCards
        epicTitle="My Epic"
        epicDescriptionPreview="An epic doing things."
        tasks={[{ id: "a", title: "Alpha", labels: [], blocks: [], blockedBy: [] }]}
        activeId="epic"
        bakeStatus="idle"
        onSelect={() => {}}
        onAdd={() => {}}
        onDelete={() => {}}
        onCancelBake={() => {}}
      />,
    );
    expect(screen.getByText("My Epic")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add task/i })).toBeInTheDocument();
  });

  it("shows the bake progress strip when baking", () => {
    render(
      <EpicTaskCards
        epicTitle=""
        epicDescriptionPreview=""
        tasks={[
          { id: "a", title: "Alpha", labels: [], blocks: [], blockedBy: [] },
          { id: "b", title: "Beta", labels: [], blocks: [], blockedBy: [] },
        ]}
        activeId="a"
        bakeStatus="baking"
        bakeTotal={2}
        bakeDone={1}
        bakeProgress={{ a: "baked", b: "baking" }}
        onSelect={() => {}}
        onAdd={() => {}}
        onDelete={() => {}}
        onCancelBake={() => {}}
      />,
    );
    expect(screen.getByText(/baking 1\/2/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
  });

  it("disables Add tile while baking", () => {
    render(
      <EpicTaskCards
        epicTitle=""
        epicDescriptionPreview=""
        tasks={[]}
        activeId="epic"
        bakeStatus="baking"
        bakeTotal={0}
        bakeDone={0}
        bakeProgress={{}}
        onSelect={() => {}}
        onAdd={() => {}}
        onDelete={() => {}}
        onCancelBake={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /add task/i })).toBeDisabled();
  });

  it("Cancel during bake fires onCancelBake", async () => {
    const onCancelBake = vi.fn();
    render(
      <EpicTaskCards
        epicTitle=""
        epicDescriptionPreview=""
        tasks={[{ id: "a", title: "A", labels: [], blocks: [], blockedBy: [] }]}
        activeId="a"
        bakeStatus="baking"
        bakeTotal={1}
        bakeDone={0}
        bakeProgress={{ a: "baking" }}
        onSelect={() => {}}
        onAdd={() => {}}
        onDelete={() => {}}
        onCancelBake={onCancelBake}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onCancelBake).toHaveBeenCalledTimes(1);
  });
});
