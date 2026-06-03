import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/auth/requireSession", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/drafts/store", () => ({
  listDrafts: vi.fn(),
  createDraft: vi.fn(),
}));

import { requireSession } from "@/lib/auth/requireSession";
import { listDrafts, createDraft } from "@/lib/drafts/store";
import { GET, POST } from "@/app/api/drafts/route";

const SESSION = { accountId: "acct-A", email: "a@b.co" } as never;

function jsonReq(body: unknown) {
  return new Request("http://localhost/api/drafts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/drafts", () => {
  it("401s when unauthenticated", async () => {
    (requireSession as ReturnType<typeof vi.fn>).mockResolvedValue(
      NextResponse.json({ error: "not_authenticated" }, { status: 401 }),
    );
    const res = await GET();
    expect(res.status).toBe(401);
  });
  it("returns the current user's drafts", async () => {
    (requireSession as ReturnType<typeof vi.fn>).mockResolvedValue(SESSION);
    (listDrafts as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "d1" }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(listDrafts).toHaveBeenCalledWith("acct-A");
    expect(await res.json()).toEqual({ drafts: [{ id: "d1" }] });
  });
});

describe("POST /api/drafts", () => {
  it("creates a draft scoped to the session account", async () => {
    (requireSession as ReturnType<typeof vi.fn>).mockResolvedValue(SESSION);
    (createDraft as ReturnType<typeof vi.fn>).mockResolvedValue("new-id");
    const res = await POST(jsonReq({ draft: { title: "Hi" } }));
    expect(res.status).toBe(201);
    expect(createDraft).toHaveBeenCalledWith("acct-A", { title: "Hi" });
    expect(await res.json()).toEqual({ id: "new-id" });
  });
  it("400s on an invalid payload", async () => {
    (requireSession as ReturnType<typeof vi.fn>).mockResolvedValue(SESSION);
    const res = await POST(jsonReq({ draft: { title: 123 } }));
    expect(res.status).toBe(400);
  });
});
