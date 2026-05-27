import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KneadingPanel } from "@/components/epic/KneadingPanel";
import type { KneadState } from "@/lib/knead/types";

function interviewing(answers: Record<string, string | string[]> = {}): KneadState {
  return {
    status: "interviewing",
    rounds: [{
      questions: [
        { id: "a", prompt: "Primary user?", section: "business", type: "text" },
        { id: "b", prompt: "Risk?", section: "technical", type: "single", options: ["Low", "High"] },
      ],
      answers,
    }],
  };
}

const noop = () => {};
const baseProps = {
  loading: false, error: null, capPrompt: null,
  onAnswer: noop, onKnead: noop, onApproveCap: noop, onDeclineCap: noop, onRetry: noop,
};

describe("<KneadingPanel>", () => {
  it("groups questions under Business and Technical headings", () => {
    render(<KneadingPanel {...baseProps} state={interviewing()} />);
    expect(screen.getByText(/business/i)).toBeInTheDocument();
    expect(screen.getByText(/technical/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/primary user/i)).toBeInTheDocument();
  });

  it("disables Knead until every question is answered", async () => {
    const onKnead = vi.fn();
    const { rerender } = render(<KneadingPanel {...baseProps} state={interviewing()} onKnead={onKnead} />);
    expect(screen.getByRole("button", { name: /^knead$/i })).toBeDisabled();
    rerender(<KneadingPanel {...baseProps} state={interviewing({ a: "Admins", b: "Low" })} onKnead={onKnead} />);
    const btn = screen.getByRole("button", { name: /^knead$/i });
    expect(btn).not.toBeDisabled();
    await userEvent.click(btn);
    expect(onKnead).toHaveBeenCalled();
  });

  it("reports answer changes via onAnswer", async () => {
    const onAnswer = vi.fn();
    render(<KneadingPanel {...baseProps} state={interviewing()} onAnswer={onAnswer} />);
    await userEvent.click(screen.getByRole("radio", { name: "High" }));
    expect(onAnswer).toHaveBeenCalledWith("b", "High");
  });

  it("shows a loading state", () => {
    render(<KneadingPanel {...baseProps} state={interviewing()} loading />);
    expect(screen.getByText(/kneading/i)).toBeInTheDocument();
  });

  it("shows an error with a retry button", async () => {
    const onRetry = vi.fn();
    render(<KneadingPanel {...baseProps} state={interviewing()} error="boom" onRetry={onRetry} />);
    expect(screen.getByText(/boom/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("shows the cap prompt with justification and yes/no actions", async () => {
    const onApproveCap = vi.fn();
    render(<KneadingPanel {...baseProps} state={interviewing()} capPrompt={{ justification: "Need auth details." }} onApproveCap={onApproveCap} />);
    expect(screen.getByText(/need auth details/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onApproveCap).toHaveBeenCalled();
  });

  it("shows the complete state with an enabled Generate sub-tasks button", async () => {
    const onGenerate = vi.fn();
    const complete: KneadState = { status: "complete", rounds: interviewing({ a: "x", b: "Low" }).rounds };
    render(<KneadingPanel {...baseProps} state={complete} onGenerate={onGenerate} />);
    expect(screen.getByText(/kneading complete/i)).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: /generate sub-tasks/i });
    expect(btn).not.toBeDisabled();
    await userEvent.click(btn);
    expect(onGenerate).toHaveBeenCalled();
  });

  it("disables Generate while generating", () => {
    const complete: KneadState = { status: "complete", rounds: interviewing({ a: "x", b: "Low" }).rounds };
    render(<KneadingPanel {...baseProps} state={complete} onGenerate={() => {}} generating />);
    expect(screen.getByRole("button", { name: /generating/i })).toBeDisabled();
  });
});
