import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runBakeAll, type BakeState } from "@/lib/epic/bake";
import { EMPTY_DRAFT } from "@/lib/draft/autosave";

vi.mock("@/lib/sse/client", () => ({
  subscribeToJob: (_jobId: string, onEvent: (e: { type: string; [k: string]: unknown }) => void) => {
    queueMicrotask(() => onEvent({ type: "finalized", payload: { story: { title: "S", markdown: "" }, markdown: "", requirement: {}, gates: { schema: { ok: true }, consistency: { ok: true } } } }));
    return () => {};
  },
}));

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ jobId: "job-1" }) }) as unknown as typeof fetch;
});
afterEach(() => { vi.restoreAllMocks(); });

const task = (id: string) => ({ id, draft: { ...EMPTY_DRAFT, title: `T-${id}`, description: `d ${id}` } });

describe("runBakeAll", () => {
  it("finalizes each task sequentially and emits baking -> baked", async () => {
    const seen: Array<[string, BakeState]> = [];
    const result = await runBakeAll({
      tasks: [task("a"), task("b")],
      onProgress: (id, state) => seen.push([id, state]),
    });
    expect(Object.keys(result.finalized).sort()).toEqual(["a", "b"]);
    expect(seen).toEqual([["a", "baking"], ["a", "baked"], ["b", "baking"], ["b", "baked"]]);
  });

  it("skips tasks already in finalizedExisting", async () => {
    const seen: Array<[string, BakeState]> = [];
    const result = await runBakeAll({
      tasks: [task("a"), task("b")],
      finalizedExisting: { a: { story: { title: "Cached", markdown: "" }, markdown: "", requirement: {}, gates: { schema: { ok: true }, consistency: { ok: true } } } as never },
      onProgress: (id, state) => seen.push([id, state]),
    });
    expect(Object.keys(result.finalized).sort()).toEqual(["a", "b"]);
    // 'a' was not re-finalized; only 'b' is in the emitted sequence
    expect(seen).toEqual([["b", "baking"], ["b", "baked"]]);
  });

  it("stops on the first error and reports failedId/failedReason", async () => {
    (global.fetch as unknown as { mockImplementation: (fn: () => unknown) => void }).mockImplementation(() => Promise.resolve({ ok: false, json: async () => ({ error: "boom" }) }));
    const seen: Array<[string, BakeState, string?]> = [];
    const result = await runBakeAll({
      tasks: [task("a"), task("b")],
      onProgress: (id, state, error) => seen.push([id, state, error]),
    });
    expect(result.failedId).toBe("a");
    expect(result.failedReason).toMatch(/boom/);
    expect(seen[seen.length - 1][1]).toBe("failed");
    // 'b' was never touched
    expect(seen.map((s) => s[0])).toEqual(["a", "a"]);
  });

  it("aborts gracefully when signal is fired between tasks", async () => {
    const ac = new AbortController();
    const seen: Array<[string, BakeState]> = [];
    const result = await runBakeAll({
      tasks: [task("a"), task("b")],
      signal: ac.signal,
      onProgress: (id, state) => {
        seen.push([id, state]);
        if (state === "baked") ac.abort();
      },
    });
    expect(Object.keys(result.finalized)).toEqual(["a"]);
    expect(result.failedId).toBe("b");
    expect(result.failedReason).toMatch(/cancelled/i);
  });
});
