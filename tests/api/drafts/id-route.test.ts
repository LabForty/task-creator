import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/auth/requireSession", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/drafts/store", () => ({
  getDraft: vi.fn(),
  updateDraft: vi.fn(),
  deleteDraft: vi.fn(),
}));

import { requireSession } from "@/lib/auth/requireSession";
import { getDraft, updateDraft, deleteDraft } from "@/lib/drafts/store";
import { GET, PATCH, DELETE } from "@/app/api/drafts/[id]/route";

const SESSION = { accountId: "acct-A", email: "a@b.co" } as never;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/drafts/[id]", () => {
  it("404s when the draft is missing or not owned", async () => {
    (requireSession as ReturnType<typeof vi.fn>).mockResolvedValue(SESSION);
    (getDraft as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/drafts/x"), ctx("x"));
    expect(res.status).toBe(404);
    expect(getDraft).toHaveBeenCalledWith("acct-A", "x");
  });
  it("returns the draft when owned", async () => {
    (requireSession as ReturnType<typeof vi.fn>).mockResolvedValue(SESSION);
    (getDraft as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "d1", payload: {} });
    const res = await GET(new Request("http://localhost/api/drafts/d1"), ctx("d1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ draft: { id: "d1", payload: {} } });
  });
});

describe("PATCH /api/drafts/[id]", () => {
  it("404s when update matches no owned row", async () => {
    (requireSession as ReturnType<typeof vi.fn>).mockResolvedValue(SESSION);
    (updateDraft as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const req = new Request("http://localhost/api/drafts/d1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draft: { title: "x" } }),
    });
    const res = await PATCH(req, ctx("d1"));
    expect(res.status).toBe(404);
    expect(updateDraft).toHaveBeenCalledWith("acct-A", "d1", { title: "x" });
  });
});

describe("DELETE /api/drafts/[id]", () => {
  it("204s when an owned row is deleted", async () => {
    (requireSession as ReturnType<typeof vi.fn>).mockResolvedValue(SESSION);
    (deleteDraft as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const res = await DELETE(new Request("http://localhost/api/drafts/d1"), ctx("d1"));
    expect(res.status).toBe(204);
    expect(deleteDraft).toHaveBeenCalledWith("acct-A", "d1");
  });
  it("404s when no owned row matched", async () => {
    (requireSession as ReturnType<typeof vi.fn>).mockResolvedValue(SESSION);
    (deleteDraft as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const res = await DELETE(new Request("http://localhost/api/drafts/x"), ctx("x"));
    expect(res.status).toBe(404);
  });
});
