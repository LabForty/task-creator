import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TaskTypePicker } from "@/components/TaskTypePicker";

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      templates: [
        { key: "story", label: "Story", modified: null },
        { key: "epic", label: "Epic", modified: null },
        { key: "bug", label: "Bug", modified: null },
      ],
    }),
  }) as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("<TaskTypePicker>", () => {
  it("disables the select and shows only the lockedTo option", async () => {
    const onChange = vi.fn();
    render(<TaskTypePicker value="story" onValueChange={onChange} lockedTo="epic" />);
    const select = (await screen.findByRole("combobox")) as HTMLSelectElement;
    expect(select.value).toBe("epic");
    expect(select).toBeDisabled();
    const options = Array.from(select.querySelectorAll("option")).filter(
      (o) => (o as HTMLOptionElement).value,
    );
    expect(options.length).toBe(1);
    expect(options[0].textContent).toMatch(/epic/i);
  });
});
