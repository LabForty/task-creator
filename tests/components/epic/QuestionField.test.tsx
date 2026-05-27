import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuestionField } from "@/components/epic/QuestionField";
import type { KneadQuestion, KneadAnswerValue } from "@/lib/knead/types";

const textQ: KneadQuestion = { id: "t", prompt: "Describe the value", section: "business", type: "text" };
const singleQ: KneadQuestion = { id: "s", prompt: "Rollout risk?", section: "technical", type: "single", options: ["Low", "High"] };
const multiQ: KneadQuestion = { id: "m", prompt: "Which surfaces?", section: "business", type: "multi", options: ["Web", "API"] };

// QuestionField is controlled, so a typing test must feed the new value back
// for keystrokes to accumulate. This harness does that and records every
// onChange call via the spy. (The single/multi tests below use a static value
// on purpose — each click is computed independently from that fixed value.)
function TextHarness({ question, onChange }: { question: KneadQuestion; onChange: (v: KneadAnswerValue) => void }) {
  const [value, setValue] = useState("");
  return (
    <QuestionField
      question={question}
      value={value}
      onChange={(v) => {
        setValue(v as string);
        onChange(v);
      }}
    />
  );
}

// Feeds the controlled value back so typed input accumulates across keystrokes.
function Harness({ question, initial, onChange }: { question: KneadQuestion; initial?: KneadAnswerValue; onChange: (v: KneadAnswerValue) => void }) {
  const [value, setValue] = useState<KneadAnswerValue | undefined>(initial);
  return <QuestionField question={question} value={value} onChange={(v) => { setValue(v); onChange(v); }} />;
}

describe("<QuestionField>", () => {
  it("renders a textarea for text questions and reports changes", async () => {
    const onChange = vi.fn();
    render(<TextHarness question={textQ} onChange={onChange} />);
    await userEvent.type(screen.getByLabelText(/describe the value/i), "big");
    expect(onChange).toHaveBeenLastCalledWith("big");
  });

  it("renders radios for single questions and reports the chosen option", async () => {
    const onChange = vi.fn();
    render(<QuestionField question={singleQ} value={undefined} onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "High" }));
    expect(onChange).toHaveBeenCalledWith("High");
  });

  it("renders checkboxes for multi questions and toggles selections", async () => {
    const onChange = vi.fn();
    render(<QuestionField question={multiQ} value={["Web"]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "API" }));
    expect(onChange).toHaveBeenCalledWith(["Web", "API"]);
    await userEvent.click(screen.getByRole("checkbox", { name: "Web" }));
    // From the original ["Web"], unchecking Web yields [].
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("lets a single question take a custom written answer", async () => {
    const onChange = vi.fn();
    render(<Harness question={singleQ} onChange={onChange} />);
    await userEvent.type(screen.getByLabelText(/custom answer for rollout risk/i), "Hybrid");
    expect(onChange).toHaveBeenLastCalledWith("Hybrid");
  });

  it("lets a multi question add a custom value on Enter", async () => {
    const onChange = vi.fn();
    render(<QuestionField question={multiQ} value={[]} onChange={onChange} />);
    await userEvent.type(screen.getByLabelText(/add a custom answer for which surfaces/i), "Mobile{Enter}");
    expect(onChange).toHaveBeenCalledWith(["Mobile"]);
  });

  it("lets a multi question add a custom value via the Add button", async () => {
    const onChange = vi.fn();
    render(<QuestionField question={multiQ} value={[]} onChange={onChange} />);
    await userEvent.type(screen.getByLabelText(/add a custom answer for which surfaces/i), "Mobile");
    await userEvent.click(screen.getByRole("button", { name: /^add$/i }));
    expect(onChange).toHaveBeenCalledWith(["Mobile"]);
  });
});
