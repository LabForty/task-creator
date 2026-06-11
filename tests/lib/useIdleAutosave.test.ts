import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useIdleAutosave } from "@/lib/draft/useIdleAutosave";

// AI-50: auto-save after 1 minute of inactivity. The hook watches a value and
// fires onIdle once per change-burst after idleMs of quiet. The first value it
// ever sees is the hydration baseline — reopening the app with a restored
// draft must NOT create a new server draft.

describe("useIdleAutosave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(initialValue: unknown = "hydrated", enabled = true) {
    const onIdle = vi.fn();
    const view = renderHook(
      ({ value, on }: { value: unknown; on: boolean }) =>
        useIdleAutosave({ value, onIdle, idleMs: 60_000, enabled: on }),
      { initialProps: { value: initialValue, on: enabled } },
    );
    return { onIdle, ...view };
  }

  it("never fires for the initial (hydration) value", () => {
    const { onIdle } = setup("restored draft");
    vi.advanceTimersByTime(180_000);
    expect(onIdle).not.toHaveBeenCalled();
  });

  it("fires once with the latest value after idleMs of no changes", () => {
    const { onIdle, rerender } = setup();
    rerender({ value: "typed", on: true });
    vi.advanceTimersByTime(59_000);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(onIdle).toHaveBeenCalledTimes(1);
    expect(onIdle).toHaveBeenCalledWith("typed");
    // Same value stays saved — no repeat fire.
    vi.advanceTimersByTime(180_000);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it("resets the idle timer while the value keeps changing", () => {
    const { onIdle, rerender } = setup();
    rerender({ value: "t1", on: true });
    vi.advanceTimersByTime(30_000);
    rerender({ value: "t2", on: true });
    vi.advanceTimersByTime(30_000);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(30_000);
    expect(onIdle).toHaveBeenCalledTimes(1);
    expect(onIdle).toHaveBeenCalledWith("t2");
  });

  it("does nothing while disabled", () => {
    const { onIdle, rerender } = setup("hydrated", false);
    rerender({ value: "typed", on: false });
    vi.advanceTimersByTime(180_000);
    expect(onIdle).not.toHaveBeenCalled();
  });

  it("skips null values and adopts the first non-null as baseline", () => {
    const { onIdle, rerender } = setup(null);
    rerender({ value: "hydrated", on: true });
    vi.advanceTimersByTime(180_000);
    expect(onIdle).not.toHaveBeenCalled();
    rerender({ value: "typed", on: true });
    vi.advanceTimersByTime(60_000);
    expect(onIdle).toHaveBeenCalledExactlyOnceWith("typed");
  });
});
