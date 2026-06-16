import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "@/components/Editor";

beforeEach(() => window.localStorage.clear());

describe("<Editor>", () => {
  it("disables Finalize when title is empty", () => {
    render(<Editor namespace="t1" onFinalize={vi.fn()} />);
    expect(screen.getByRole("button", { name: /finalize task/i })).toBeDisabled();
  });

  it("enables Finalize once a title is typed", async () => {
    render(<Editor namespace="t2" onFinalize={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/task title/i), "Export users");
    expect(screen.getByRole("button", { name: /finalize task/i })).not.toBeDisabled();
  });

  it("calls onFinalize with the assembled draft", async () => {
    const onFinalize = vi.fn();
    render(<Editor namespace="t3" onFinalize={onFinalize} />);
    await userEvent.type(screen.getByLabelText(/task title/i), "Export users");
    // The acceptance-criteria editor is a list of one-input-per-row. Type into
    // the first row, then add a second row and type there.
    const firstAc = screen.getByLabelText(/^acceptance criterion 1$/i);
    await userEvent.type(firstAc, "First ac");
    await userEvent.click(screen.getByRole("button", { name: /add criterion/i }));
    const secondAc = await screen.findByLabelText(/^acceptance criterion 2$/i);
    await userEvent.type(secondAc, "Second ac");
    await userEvent.click(screen.getByRole("button", { name: /finalize task/i }));
    expect(onFinalize).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Export users",
        acceptanceCriteria: ["First ac", "Second ac"],
      }),
    );
  });

  it("does not call onFinalize when title is whitespace-only", async () => {
    const onFinalize = vi.fn();
    render(<Editor namespace="t4" onFinalize={onFinalize} />);
    await userEvent.type(screen.getByLabelText(/task title/i), "   ");
    await userEvent.click(screen.getByRole("button", { name: /finalize task/i }));
    expect(onFinalize).not.toHaveBeenCalled();
  });

  it("hydrates fields from localStorage on mount", async () => {
    window.localStorage.setItem(
      "task-creator:draft:t5",
      JSON.stringify({ title: "Persisted", description: "Hi", acceptanceCriteria: [], constraints: "" }),
    );
    render(<Editor namespace="t5" onFinalize={vi.fn()} />);
    const title = await screen.findByDisplayValue("Persisted");
    expect(title).toBeInTheDocument();
  });

  it("respects the disabled prop on the submit button", () => {
    render(<Editor namespace="t6" onFinalize={vi.fn()} disabled />);
    expect(screen.getByRole("button", { name: /finalize task/i })).toBeDisabled();
  });

  it("shows 'Knead tasks' in epic mode", () => {
    render(<Editor namespace="e1" onFinalize={vi.fn()} mode="epic" onKnead={vi.fn()} />);
    expect(screen.getByRole("button", { name: /knead tasks/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /finalize task/i })).not.toBeInTheDocument();
  });

  it("enables 'Knead tasks' from a description even with no title, and calls onKnead", async () => {
    const onKnead = vi.fn();
    render(<Editor namespace="e2" onFinalize={vi.fn()} mode="epic" onKnead={onKnead} />);
    const btn = screen.getByRole("button", { name: /knead tasks/i });
    expect(btn).toBeDisabled();
    // RichTextDescription wraps the toolbar + editor in a single <label>, so the
    // label text associates with the toolbar buttons too. Scope to the editor's
    // own aria-labelled <div> to type into the rich-text field unambiguously.
    await userEvent.type(
      await screen.findByLabelText(/^description/i, { selector: "div" }),
      "Build an onboarding wizard",
    );
    expect(screen.getByRole("button", { name: /knead tasks/i })).not.toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /knead tasks/i }));
    expect(onKnead).toHaveBeenCalled();
  });

  it("respects kneadDisabled in epic mode", async () => {
    render(<Editor namespace="e3" onFinalize={vi.fn()} mode="epic" onKnead={vi.fn()} kneadDisabled />);
    await userEvent.type(
      await screen.findByLabelText(/^description/i, { selector: "div" }),
      "Some epic",
    );
    expect(screen.getByRole("button", { name: /knead tasks/i })).toBeDisabled();
  });

  it("hides the submit button when hideSubmit is set", () => {
    render(<Editor namespace="hs1" onFinalize={vi.fn()} hideSubmit />);
    expect(screen.queryByRole("button", { name: /finalize task/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /knead tasks/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/task title/i)).toBeInTheDocument();
  });

  it("renders a Clear button when onClear is provided and fires after confirm", async () => {
    const onClear = vi.fn();
    render(
      <Editor namespace="standalone:test:editor-clear" onFinalize={() => {}} onClear={onClear} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /^clear$/i }));
    await userEvent.click(screen.getByRole("button", { name: /^yes$/i }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("does not render Clear when onClear is omitted", () => {
    render(<Editor namespace="standalone:test:editor-no-clear" onFinalize={() => {}} />);
    expect(screen.queryByRole("button", { name: /^clear$/i })).toBeNull();
  });

  it("shows 'Ready to finalize' once the draft is complete", () => {
    // A complete draft: title + a description of >= 40 visible chars + >= 1 AC.
    window.localStorage.setItem(
      "task-creator:draft:r1",
      JSON.stringify({
        title: "Export users",
        description: "Allow operators to export the full user list as a downloadable CSV file.",
        acceptanceCriteria: ["The endpoint returns 200 with a CSV body"],
        constraints: "",
      }),
    );
    render(<Editor namespace="r1" onFinalize={vi.fn()} />);
    expect(screen.getByText(/ready to finalize/i)).toBeInTheDocument();
  });

  it("shows a partial readiness state (no 'Ready to finalize') for an incomplete draft", () => {
    // Title only — score 1/3, so the completion label must not appear yet.
    window.localStorage.setItem(
      "task-creator:draft:r2",
      JSON.stringify({
        title: "Export users",
        description: "",
        acceptanceCriteria: [],
        constraints: "",
      }),
    );
    render(<Editor namespace="r2" onFinalize={vi.fn()} />);
    expect(screen.queryByText(/ready to finalize/i)).toBeNull();
    // The editor is non-blank, so the (genuinely wired) Enter-to-finalize
    // shortcut chip is present. Its text is split across a <kbd> ("↵") and a
    // trailing text node ("Finalize"), so match on the element's content.
    expect(
      screen.getByText(
        (_content, el) => el?.tagName === "SPAN" && el.textContent?.trim() === "↵ Finalize",
      ),
    ).toBeInTheDocument();
  });
});
