import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runBatchUpload } from "@/lib/upload/orchestrator";
import type { UploadTask, UploadDestination, RowState } from "@/lib/upload/types";
import { EMPTY_DRAFT } from "@/lib/draft/autosave";

const dest: UploadDestination = {
  cloudId: "cid",
  projectKey: "AI",
  issueTypeId: "10001",
  epic: { kind: "existing", key: "AI-36" },
};

function task(id: string): UploadTask {
  return { id, draft: { ...EMPTY_DRAFT, title: `T-${id}`, description: `desc ${id}` }, labels: [] };
}

// Helper: stub subscribeToJob from @/lib/sse/client so the orchestrator's
// SSE call resolves synchronously with the desired payload.
type FinalizedPayloadShape = { story: unknown; markdown: string; requirement?: unknown };
let nextFinalize: { kind: "ok"; payload: FinalizedPayloadShape } | { kind: "fail"; message: string } | null = null;

vi.mock("@/lib/sse/client", () => ({
  subscribeToJob: (_jobId: string, onEvent: (e: { type: string; [k: string]: unknown }) => void) => {
    const r = nextFinalize;
    queueMicrotask(() => {
      if (!r) return;
      if (r.kind === "ok") onEvent({ type: "finalized", payload: r.payload });
      else onEvent({ type: "error", message: r.message });
    });
    return () => {};
  },
}));

beforeEach(() => {
  nextFinalize = { kind: "ok", payload: { story: { title: "S", markdown: "" }, markdown: "" } };
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("/api/finalize")) {
      return Promise.resolve({ ok: true, json: async () => ({ jobId: "job-1" }) }) as unknown as Promise<Response>;
    }
    if (typeof url === "string" && url.includes("/api/jira/export")) {
      return Promise.resolve({ ok: true, json: async () => ({ key: "AI-99", url: "https://x/AI-99" }) }) as unknown as Promise<Response>;
    }
    return Promise.reject(new Error(`unexpected url ${url}`));
  }) as unknown as typeof fetch;
});
afterEach(() => { vi.restoreAllMocks(); });

describe("runBatchUpload", () => {
  it("processes tasks in input order, sequentially, emitting finalizing -> uploading -> uploaded", async () => {
    const seen: Array<[string, RowState["kind"]]> = [];
    const result = await runBatchUpload({
      tasks: [task("a"), task("b")],
      destination: dest,
      onRow: (id, state) => seen.push([id, state.kind]),
    });
    expect(result.uploaded).toEqual(["a", "b"]);
    expect(result.failedId).toBeUndefined();
    expect(seen).toEqual([
      ["a", "finalizing"], ["a", "uploading"], ["a", "uploaded"],
      ["b", "finalizing"], ["b", "uploading"], ["b", "uploaded"],
    ]);
  });

  it("stops on the first error and marks that row as failed (no further rows touched)", async () => {
    let i = 0;
    (global.fetch as unknown as { mockImplementation: (fn: (url: string) => unknown) => void }).mockImplementation((url: string) => {
      if (url.includes("/api/finalize")) {
        return Promise.resolve({ ok: true, json: async () => ({ jobId: "job-1" }) });
      }
      if (url.includes("/api/jira/export")) {
        i += 1;
        if (i === 2) return Promise.resolve({ ok: false, json: async () => ({ error: "boom" }) });
        return Promise.resolve({ ok: true, json: async () => ({ key: `AI-${i}`, url: "u" }) });
      }
      return Promise.reject(new Error("unexpected"));
    });
    const seen: Array<[string, RowState["kind"], string?]> = [];
    const result = await runBatchUpload({
      tasks: [task("a"), task("b"), task("c")],
      destination: dest,
      onRow: (id, state) =>
        seen.push([id, state.kind, state.kind === "failed" ? state.reason : state.kind === "uploaded" ? state.issueKey : undefined]),
    });
    expect(result.uploaded).toEqual(["a"]);
    expect(result.failedId).toBe("b");
    expect(result.failedReason).toMatch(/boom/);
    // "c" was never touched.
    expect(seen.map((s) => s[0])).toEqual(["a", "a", "a", "b", "b", "b"]);
    expect(seen[seen.length - 1][1]).toBe("failed");
  });

  it("aborts gracefully when signal is aborted between rows", async () => {
    const ac = new AbortController();
    const seen: Array<[string, RowState["kind"]]> = [];
    const promise = runBatchUpload({
      tasks: [task("a"), task("b")],
      destination: dest,
      signal: ac.signal,
      onRow: (id, state) => {
        seen.push([id, state.kind]);
        if (state.kind === "uploaded") ac.abort();
      },
    });
    const result = await promise;
    expect(result.uploaded).toEqual(["a"]);
    expect(result.failedId).toBe("b");
    expect(result.failedReason).toMatch(/cancelled/i);
  });

  it("sends metadata.epic with kind:'existing' when destination carries an existing epic", async () => {
    let exportBody: { metadata?: { epic?: { kind?: string; key?: string } } } | null = null;
    (global.fetch as unknown as { mockImplementation: (fn: (url: string, init?: RequestInit) => unknown) => void }).mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/api/finalize")) {
        return Promise.resolve({ ok: true, json: async () => ({ jobId: "job-1" }) });
      }
      if (url.includes("/api/jira/export")) {
        exportBody = JSON.parse((init?.body as string) ?? "{}");
        return Promise.resolve({ ok: true, json: async () => ({ key: "AI-99", url: "https://x/AI-99" }) });
      }
      return Promise.reject(new Error("unexpected"));
    });
    await runBatchUpload({
      tasks: [task("a")],
      destination: dest,
      onRow: () => {},
    });
    expect(exportBody).not.toBeNull();
    expect(exportBody!.metadata?.epic?.kind).toBe("existing");
    expect(exportBody!.metadata?.epic?.key).toBe("AI-36");
  });

  it("treats an empty tasks list as a no-op (returns empty uploaded)", async () => {
    const result = await runBatchUpload({ tasks: [], destination: dest, onRow: () => {} });
    expect(result.uploaded).toEqual([]);
    expect(result.failedId).toBeUndefined();
  });

  it("pre-creates a new epic before the sub-task loop when epic.kind === 'new'", async () => {
    let epicCreated = false;
    let exportEpicKey: string | undefined;
    (global.fetch as unknown as { mockImplementation: (fn: (url: string, init?: RequestInit) => unknown) => void }).mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/api/jira/epic/create")) {
        epicCreated = true;
        return Promise.resolve({ ok: true, json: async () => ({ key: "AI-EPIC", url: "https://x/AI-EPIC" }) });
      }
      if (url.includes("/api/finalize")) {
        return Promise.resolve({ ok: true, json: async () => ({ jobId: "job-1" }) });
      }
      if (url.includes("/api/jira/export")) {
        const body = JSON.parse((init?.body as string) ?? "{}") as { metadata?: { epic?: { kind?: string; key?: string } } };
        exportEpicKey = body.metadata?.epic?.key;
        return Promise.resolve({ ok: true, json: async () => ({ key: "AI-99", url: "https://x/AI-99" }) });
      }
      return Promise.reject(new Error("unexpected"));
    });
    const result = await runBatchUpload({
      tasks: [task("a")],
      destination: {
        cloudId: "cid",
        projectKey: "AI",
        issueTypeId: "10001",
        epic: { kind: "new", title: "Big Epic", descriptionHtml: "<p>hi</p>" },
      },
      onRow: () => {},
    });
    expect(epicCreated).toBe(true);
    expect(exportEpicKey).toBe("AI-EPIC");
    expect(result.uploaded).toEqual(["a"]);
  });

  it("aborts the batch when epic pre-creation fails (no sub-tasks attempted)", async () => {
    let finalizeCalls = 0;
    (global.fetch as unknown as { mockImplementation: (fn: (url: string) => unknown) => void }).mockImplementation((url: string) => {
      if (url.includes("/api/jira/epic/create")) {
        return Promise.resolve({ ok: false, json: async () => ({ error: "no epic type" }) });
      }
      if (url.includes("/api/finalize")) {
        finalizeCalls += 1;
        return Promise.resolve({ ok: true, json: async () => ({ jobId: "job-1" }) });
      }
      return Promise.reject(new Error("unexpected"));
    });
    const result = await runBatchUpload({
      tasks: [task("a"), task("b")],
      destination: {
        cloudId: "cid",
        projectKey: "AI",
        issueTypeId: "10001",
        epic: { kind: "new", title: "T" },
      },
      onRow: () => {},
    });
    expect(finalizeCalls).toBe(0);
    expect(result.uploaded).toEqual([]);
    expect(result.failedReason).toMatch(/epic create/i);
  });
});
