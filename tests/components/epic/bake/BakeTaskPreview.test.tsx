import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BakeTaskPreview } from "@/components/epic/bake/BakeTaskPreview";
import type { FinalizedPayload } from "@/lib/jobs/types";

vi.mock("@/components/Preview", () => ({
  Preview: ({ payload }: { payload: FinalizedPayload }) => (
    <div data-testid="preview-stub">title:{payload.story.title}</div>
  ),
}));

const finalized: FinalizedPayload = {
  story: { title: "Build the thing", markdown: "## body" },
  markdown: "## body",
  requirement: { title: "Build the thing" } as never,
  gates: { schema: { ok: true }, consistency: { ok: true } } as never,
};

describe("<BakeTaskPreview>", () => {
  it("renders the Preview with the per-task finalized payload", () => {
    render(
      <BakeTaskPreview
        taskId="a"
        finalized={finalized}
        diagrams={undefined}
        onCreateDiagrams={() => {}}
        creatingDiagrams={false}
        onEditDiagram={() => {}}
        onRegenerateDiagram={() => {}}
        regeneratingFormat={null}
        onAnalyzeDiagrams={() => {}}
        analyzingDiagrams={false}
        analysisFindings={null}
        onApplyAnalysis={() => {}}
        applyingAnalysis={false}
        onDismissAnalysis={() => {}}
        onMarkdownChange={() => {}}
      />,
    );
    expect(screen.getByTestId("preview-stub")).toHaveTextContent("title:Build the thing");
  });
});
