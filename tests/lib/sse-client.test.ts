import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Listener = (ev: MessageEvent) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  closed = false;
  listeners = new Map<string, Listener[]>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: Listener) {
    const arr = this.listeners.get(type) ?? [];
    arr.push(fn);
    this.listeners.set(type, arr);
  }
  emit(type: string, data: unknown) {
    for (const fn of this.listeners.get(type) ?? []) {
      fn(new MessageEvent(type, { data: JSON.stringify(data) }));
    }
  }
  close() {
    this.closed = true;
  }
}

const originalEventSource = globalThis.EventSource;

beforeEach(() => {
  FakeEventSource.instances = [];
  (globalThis as unknown as { EventSource: typeof EventSource }).EventSource =
    FakeEventSource as unknown as typeof EventSource;
});

afterEach(() => {
  (globalThis as unknown as { EventSource: typeof EventSource }).EventSource =
    originalEventSource;
});

describe("lib/sse/client.subscribeToJob", () => {
  it("opens an EventSource pointed at /api/jobs/:id/stream", async () => {
    const { subscribeToJob } = await import("@/lib/sse/client");
    subscribeToJob("j_abc", () => {});
    const es = FakeEventSource.instances[0];
    expect(es.url).toBe("/api/jobs/j_abc/stream");
  });

  it("registers a handler for every JobEvent variant", async () => {
    const { subscribeToJob } = await import("@/lib/sse/client");
    subscribeToJob("j_x", () => {});
    const es = FakeEventSource.instances[0];
    const expected = [
      "role_started",
      "role_progress",
      "role_token",
      "gate_result",
      "role_finished",
      "finalized",
      "gates_failed",
      "error",
    ];
    for (const t of expected) {
      expect(es.listeners.get(t)?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("calls onEvent with the parsed JSON payload", async () => {
    const { subscribeToJob } = await import("@/lib/sse/client");
    const cb = vi.fn();
    subscribeToJob("j_y", cb);
    const es = FakeEventSource.instances[0];
    es.emit("role_started", { type: "role_started", role: "analyst" });
    expect(cb).toHaveBeenCalledWith({ type: "role_started", role: "analyst" });
  });

  it("returns an unsubscribe that closes the EventSource", async () => {
    const { subscribeToJob } = await import("@/lib/sse/client");
    const unsub = subscribeToJob("j_z", () => {});
    const es = FakeEventSource.instances[0];
    expect(es.closed).toBe(false);
    unsub();
    expect(es.closed).toBe(true);
  });

  it("ignores malformed JSON payloads (no throw)", async () => {
    const { subscribeToJob } = await import("@/lib/sse/client");
    const cb = vi.fn();
    subscribeToJob("j_q", cb);
    const es = FakeEventSource.instances[0];
    // Inject a malformed MessageEvent manually
    for (const fn of es.listeners.get("role_started") ?? []) {
      expect(() => fn(new MessageEvent("role_started", { data: "{bad" }))).not.toThrow();
    }
    expect(cb).not.toHaveBeenCalled();
  });
});
