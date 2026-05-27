import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CapturedContext } from "@/components/epic/CapturedContext";
import type { KneadRound } from "@/lib/knead/types";

const rounds: KneadRound[] = [
  {
    questions: [
      { id: "a", prompt: "Primary user?", section: "business", type: "text" },
      { id: "b", prompt: "Surfaces?", section: "business", type: "multi", options: ["Web", "API"] },
      { id: "c", prompt: "Unanswered?", section: "technical", type: "text" },
    ],
    answers: { a: "Admins", b: ["Web", "API"] },
  },
];

describe("<CapturedContext>", () => {
  it("renders answered questions with their answers", () => {
    render(<CapturedContext rounds={rounds} />);
    expect(screen.getByText("Primary user?")).toBeInTheDocument();
    expect(screen.getByText("Admins")).toBeInTheDocument();
    expect(screen.getByText("Web, API")).toBeInTheDocument();
  });

  it("omits questions that have no answer yet", () => {
    render(<CapturedContext rounds={rounds} />);
    expect(screen.queryByText("Unanswered?")).not.toBeInTheDocument();
  });

  it("renders nothing when there are no answered questions", () => {
    const { container } = render(<CapturedContext rounds={[{ questions: [], answers: {} }]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("has no form controls (read-only)", () => {
    render(<CapturedContext rounds={rounds} />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
