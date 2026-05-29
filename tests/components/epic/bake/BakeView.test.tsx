import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BakeView } from "@/components/epic/bake/BakeView";
import type { FinalizedPayload } from "@/lib/jobs/types";

vi.mock("@/components/MermaidDiagram", () => ({
  MermaidDiagram: ({ source }: { source: string }) => <pre data-testid="md-source">{source}</pre>,
}));
vi.mock("@/components/Preview", () => ({
  Preview: ({ payload }: { payload: FinalizedPayload }) => <div data-testid="preview">{payload.story.title}</div>,
}));

const tasks = [
  { id: "a", title: "Alpha", labels: [], blocks: [], blockedBy: [] },
  { id: "b", title: "Bravo", labels: [], blocks: [], blockedBy: [] },
];

const finalized = {
  a: { story: { title: "Alpha story", markdown: "" }, markdown: "", requirement: {}, gates: { schema: { ok: true }, consistency: { ok: true } } } as FinalizedPayload,
  b: { story: { title: "Bravo story", markdown: "" }, markdown: "", requirement: {}, gates: { schema: { ok: true }, consistency: { ok: true } } } as FinalizedPayload,
};

const baseProps = {
  tasks,
  selectedId: "epic" as const,
  finalizedById: finalized,
  diagramsById: {} as Record<string, never>,
  failedIds: {} as Record<string, string>,
  onSelect: () => {},
  onUploadAll: () => {},
  onBackToEditing: () => {},
  onCreateDiagrams: () => {},
  creatingForId: null,
  onEditDiagram: () => {},
  onRegenerateDiagram: () => {},
  regeneratingForId: null,
  regeneratingFormat: null,
  onAnalyzeDiagrams: () => {},
  analyzingForId: null,
  analysisFindings: {} as Record<string, never>,
  onApplyAnalysis: () => {},
  applyingForId: null,
  onDismissAnalysis: () => {},
  onMarkdownChange: () => {},
};

describe("<BakeView>", () => {
  it("renders Epic overview by default (task graph)", () => {
    render(<BakeView {...baseProps} />);
    const src = screen.getByTestId("md-source").textContent ?? "";
    expect(src).toContain("graph TD");
    expect(src).toContain("Alpha");
  });

  it("renders the BakeTaskPreview when a task is selected", () => {
    render(<BakeView {...baseProps} selectedId="a" />);
    expect(screen.getByTestId("preview")).toHaveTextContent("Alpha story");
  });
});
