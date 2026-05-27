import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LabelsEditor } from "@/components/epic/LabelsEditor";

function Harness({ initial = [], onChange }: { initial?: string[]; onChange: (v: string[]) => void }) {
  const [value, setValue] = useState<string[]>(initial);
  return <LabelsEditor value={value} onChange={(v) => { setValue(v); onChange(v); }} />;
}

describe("<LabelsEditor>", () => {
  it("adds a label on Enter", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.type(screen.getByLabelText(/add label/i), "backend{Enter}");
    expect(onChange).toHaveBeenLastCalledWith(["backend"]);
  });

  it("dedupes case-insensitively", async () => {
    const onChange = vi.fn();
    render(<Harness initial={["backend"]} onChange={onChange} />);
    await userEvent.type(screen.getByLabelText(/add label/i), "Backend{Enter}");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("removes a label via its × button", async () => {
    const onChange = vi.fn();
    render(<Harness initial={["backend", "frontend"]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /remove backend/i }));
    expect(onChange).toHaveBeenLastCalledWith(["frontend"]);
  });
});
