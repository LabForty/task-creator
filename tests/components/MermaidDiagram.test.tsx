import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Mock the mermaid module so jsdom doesn't try to actually render SVG.
const renderMock = vi.fn();
const parseMock = vi.fn();
const initializeMock = vi.fn();

vi.mock("mermaid", () => ({
  default: {
    initialize: initializeMock,
    parse: parseMock,
    render: renderMock,
  },
}));

import { MermaidDiagram } from "@/components/MermaidDiagram";

beforeEach(() => {
  renderMock.mockReset();
  parseMock.mockReset();
  initializeMock.mockReset();
});

describe("<MermaidDiagram>", () => {
  it("calls mermaid.render with the supplied source and injects the resulting SVG", async () => {
    parseMock.mockResolvedValue(true);
    renderMock.mockResolvedValue({ svg: '<svg data-testid="diag"><g/></svg>' });

    const { container } = render(<MermaidDiagram source="flowchart TD; A-->B" />);

    await waitFor(() => {
      expect(renderMock).toHaveBeenCalled();
    });
    expect(renderMock.mock.calls[0][1]).toBe("flowchart TD; A-->B");
    expect(container.innerHTML).toContain("<svg");
  });

  it("calls mermaid.parse for syntax validation before rendering", async () => {
    parseMock.mockResolvedValue(true);
    renderMock.mockResolvedValue({ svg: "<svg/>" });

    render(<MermaidDiagram source="flowchart TD; A-->B" />);
    await waitFor(() => expect(parseMock).toHaveBeenCalled());
    expect(parseMock).toHaveBeenCalledWith("flowchart TD; A-->B");
  });

  it("renders an inline error and calls onError when mermaid.parse rejects", async () => {
    parseMock.mockRejectedValue(new Error("Parse error on line 1"));
    const onError = vi.fn();

    render(<MermaidDiagram source="not valid mermaid" onError={onError} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/parse error/i);
    expect(onError).toHaveBeenCalledWith("Parse error on line 1");
    expect(renderMock).not.toHaveBeenCalled();
  });

  it("renders nothing while source is empty (no parse/render calls)", () => {
    render(<MermaidDiagram source="" />);
    expect(renderMock).not.toHaveBeenCalled();
    expect(parseMock).not.toHaveBeenCalled();
  });

  it("re-renders when the source changes", async () => {
    parseMock.mockResolvedValue(true);
    renderMock.mockResolvedValue({ svg: "<svg/>" });

    const { rerender } = render(<MermaidDiagram source="flowchart TD; A-->B" />);
    await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(1));

    rerender(<MermaidDiagram source="sequenceDiagram; A->>B: hi" />);
    await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(2));
    expect(renderMock.mock.calls[1][1]).toBe("sequenceDiagram; A->>B: hi");
  });
});
