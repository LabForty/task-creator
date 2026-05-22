import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AttachmentsField } from "@/components/jira-metadata/AttachmentsField";

function makeFile(name: string, sizeBytes: number, type = "text/plain"): File {
  const f = new File([new Uint8Array(sizeBytes)], name, { type });
  Object.defineProperty(f, "size", { value: sizeBytes });
  return f;
}

describe("AttachmentsField", () => {
  it("accepts files and lists them with name + size", () => {
    const onChange = vi.fn();
    render(<AttachmentsField value={[]} onChange={onChange} maxBytes={1024 * 1024} />);
    fireEvent.change(screen.getByLabelText(/choose files/i), {
      target: { files: [makeFile("a.txt", 100)] },
    });
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0][0];
    expect(next[0].file.name).toBe("a.txt");
  });

  it("rejects oversized files with an inline message naming the file", () => {
    const onChange = vi.fn();
    render(<AttachmentsField value={[]} onChange={onChange} maxBytes={500} />);
    fireEvent.change(screen.getByLabelText(/choose files/i), {
      target: { files: [makeFile("big.bin", 1000), makeFile("ok.txt", 100)] },
    });
    expect(screen.getByText(/File too large.*big.bin/i)).toBeInTheDocument();
    const next = onChange.mock.calls[0][0];
    expect(next.map((a: any) => a.file.name)).toEqual(["ok.txt"]);
  });

  it("removes a row via the remove control", async () => {
    const onChange = vi.fn();
    const existing = [{ id: "1", file: makeFile("a.txt", 100) }];
    render(<AttachmentsField value={existing} onChange={onChange} maxBytes={1024 * 1024} />);
    fireEvent.click(screen.getByLabelText("Remove a.txt"));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
