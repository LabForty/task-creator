import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HelpPanel } from "@/components/HelpPanel";
import { EMPTY_DRAFT } from "@/lib/draft/autosave";

// jsdom does not implement Element.scrollTo, but HelpPanel calls it from an
// effect on mount. Polyfill as a no-op so the panel renders quietly.
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = function () {};
}

// Help auto-scans on mount via fetch. Stub it so the panel renders quietly.
beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ text: "Nothing to add.", done: false }),
  }) as unknown as typeof fetch;
});
afterEach(() => { vi.restoreAllMocks(); });

describe("<HelpPanel> walk header", () => {
  it("does not render walk controls when walkInfo is omitted", () => {
    render(
      <HelpPanel
        surface="editor"
        draft={EMPTY_DRAFT}
        history={[]}
        onUpdateHistory={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: /next task/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /stop walk/i })).toBeNull();
  });

  it("renders 'Walk N/M' chip and Next + Stop when walkInfo is provided", async () => {
    const onNext = vi.fn();
    const onStop = vi.fn();
    render(
      <HelpPanel
        surface="editor"
        draft={EMPTY_DRAFT}
        history={[]}
        onUpdateHistory={() => {}}
        onClose={() => {}}
        walkInfo={{ index: 1, total: 3, onNext, onStop }}
      />,
    );
    expect(screen.getByText(/walk 2\/3/i)).toBeInTheDocument(); // index is 0-based, display is 1-based
    await userEvent.click(screen.getByRole("button", { name: /next task/i }));
    expect(onNext).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: /stop walk/i }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("disables Next task on the last item", () => {
    render(
      <HelpPanel
        surface="editor"
        draft={EMPTY_DRAFT}
        history={[]}
        onUpdateHistory={() => {}}
        onClose={() => {}}
        walkInfo={{ index: 2, total: 3, onNext: () => {}, onStop: () => {} }}
      />,
    );
    expect(screen.getByRole("button", { name: /next task/i })).toBeDisabled();
  });
});
