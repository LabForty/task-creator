import { describe, it, expect, beforeEach } from "vitest";
import { middleware } from "@/middleware";
import { NextRequest } from "next/server";

beforeEach(() => {
  delete process.env.TASK_EMBED_ORIGINS;
});

function req(opts: { method?: string; origin?: string } = {}): NextRequest {
  const headers: Record<string, string> = {};
  if (opts.origin) headers.origin = opts.origin;
  return new NextRequest(new Request("http://x/api/finalize", { method: opts.method ?? "POST", headers }));
}

describe("middleware (CORS for /api/*)", () => {
  it("preflight from an allowed origin returns 204 with CORS headers", () => {
    process.env.TASK_EMBED_ORIGINS = "https://cowork.example";
    const res = middleware(req({ method: "OPTIONS", origin: "https://cowork.example" }));
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://cowork.example");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
    expect(res.headers.get("vary")).toBe("Origin");
  });

  it("preflight from a disallowed origin still returns 204 but without ACAO", () => {
    process.env.TASK_EMBED_ORIGINS = "https://cowork.example";
    const res = middleware(req({ method: "OPTIONS", origin: "https://evil.example" }));
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("regular request passes through with ACAO when origin is allowed", () => {
    process.env.TASK_EMBED_ORIGINS = "https://cowork.example";
    const res = middleware(req({ origin: "https://cowork.example" }));
    expect(res.headers.get("access-control-allow-origin")).toBe("https://cowork.example");
    expect(res.headers.get("vary")).toBe("Origin");
  });

  it("regular request from disallowed origin passes through without ACAO (route handler enforces 403)", () => {
    process.env.TASK_EMBED_ORIGINS = "https://cowork.example";
    const res = middleware(req({ origin: "https://evil.example" }));
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("when allowlist is empty (dev default), any origin gets ACAO", () => {
    const res = middleware(req({ origin: "https://any.example" }));
    expect(res.headers.get("access-control-allow-origin")).toBe("https://any.example");
  });

  it("requests with no origin (same-origin / curl) get no ACAO header", () => {
    const res = middleware(req());
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});
