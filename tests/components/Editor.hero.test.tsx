import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Editor } from "@/components/Editor";

describe("Editor hero empty state", () => {
  it("shows the hero headline when the draft is blank", () => {
    render(<Editor namespace="test:hero" onFinalize={() => {}} />);
    expect(
      screen.getByRole("heading", { name: /turn an idea into a structured task/i }),
    ).toBeInTheDocument();
  });

  it("offers a clickable idea-prompt control in the hero", () => {
    render(<Editor namespace="test:hero-prompt" onFinalize={() => {}} />);
    // The Typewriter renders its rotating phrase inside a live region; with
    // onPick it wraps that in a <button>.
    const button = screen.getByRole("status").closest("button");
    expect(button).not.toBeNull();
  });

  it("prefills the draft when an idea-prompt is picked, hiding the hero", async () => {
    render(<Editor namespace="test:hero-pick" onFinalize={() => {}} />);
    // Hero shown initially.
    expect(
      screen.getByRole("heading", { name: /turn an idea into a structured task/i }),
    ).toBeInTheDocument();

    const button = screen.getByRole("status").closest("button");
    expect(button).not.toBeNull();
    fireEvent.click(button as HTMLButtonElement);

    // Picking an idea seeds the description → draft is no longer blank → the
    // hero gives way to the compact header.
    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: /turn an idea into a structured task/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: /what needs to happen\?/i }),
      ).toBeInTheDocument();
    });
  });

  it("uses the same header type scale before and after typing starts", async () => {
    render(<Editor namespace="test:hero-header-scale" onFinalize={() => {}} />);
    const heroHeading = screen.getByRole("heading", {
      name: /turn an idea into a structured task/i,
    });
    expect(heroHeading.className).toContain("text-hig-title2");

    const button = screen.getByRole("status").closest("button");
    expect(button).not.toBeNull();
    fireEvent.click(button as HTMLButtonElement);

    await waitFor(() => {
      const compactHeading = screen.getByRole("heading", {
        name: /what needs to happen\?/i,
      });
      expect(compactHeading.className).toContain("text-hig-title2");
    });
  });
});
