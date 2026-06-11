import { describe, it, expect, vi, beforeEach } from "vitest";

// A chainable fake of the Supabase query builder. Records every .eq() filter
// and resolves to a preset { data, error }. Thenable so `await builder` works
// for the list query; maybeSingle/single return the same preset.
function makeFake(result: { data: unknown; error: unknown }) {
  const eqCalls: Array<[string, unknown]> = [];
  let inserted: unknown = null;
  let updated: unknown = null;
  const builder: any = {
    eqCalls,
    get inserted() { return inserted; },
    get updated() { return updated; },
    select() { return builder; },
    order() { return builder; },
    insert(v: unknown) { inserted = v; return builder; },
    update(v: unknown) { updated = v; return builder; },
    delete() { return builder; },
    eq(col: string, val: unknown) { eqCalls.push([col, val]); return builder; },
    maybeSingle() { return Promise.resolve(result); },
    single() { return Promise.resolve(result); },
    then(res: (v: unknown) => unknown) { return Promise.resolve(result).then(res); },
  };
  return builder;
}

const fromMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getServiceClient: () => ({ from: fromMock }),
}));

import {
  listDrafts,
  getDraft,
  createDraft,
  updateDraft,
  deleteDraft,
} from "@/lib/drafts/store";

beforeEach(() => fromMock.mockReset());

describe("listDrafts", () => {
  it("filters by owner and maps rows to list items", async () => {
    const fake = makeFake({
      data: [
        { id: "d1", working_title: "T", mode: "single", updated_at: "2026-06-03T00:00:00Z", payload: { description: "<p>hi</p>" } },
      ],
      error: null,
    });
    fromMock.mockReturnValue(fake);
    const items = await listDrafts("acct-A");
    expect(fake.eqCalls).toContainEqual(["owner_account_id", "acct-A"]);
    expect(items[0]).toMatchObject({ id: "d1", workingTitle: "T", preview: "hi" });
  });

  // AI-50: a row whose payload no longer matches the current Draft shape must
  // map to a degraded list item, not fail the whole list with a 500.
  it("maps a row with a corrupt payload instead of failing the whole list", async () => {
    const fake = makeFake({
      data: [
        { id: "good", working_title: "Good", mode: "single", updated_at: "2026-06-03T00:00:00Z", payload: { description: "<p>ok</p>" } },
        { id: "bad", working_title: null, mode: "single", updated_at: "2026-06-03T00:00:00Z", payload: { description: { rich: true } } },
      ],
      error: null,
    });
    fromMock.mockReturnValue(fake);
    const items = await listDrafts("acct-A");
    expect(items.map((i) => i.id)).toEqual(["good", "bad"]);
    expect(items[1]).toMatchObject({ workingTitle: "Untitled draft", preview: "" });
  });
});

describe("getDraft", () => {
  it("filters by BOTH owner and id; returns null when not found", async () => {
    const fake = makeFake({ data: null, error: null });
    fromMock.mockReturnValue(fake);
    const draft = await getDraft("acct-A", "d-missing");
    expect(fake.eqCalls).toContainEqual(["owner_account_id", "acct-A"]);
    expect(fake.eqCalls).toContainEqual(["id", "d-missing"]);
    expect(draft).toBeNull();
  });
});

describe("createDraft", () => {
  it("inserts owner from arg, defaults mode to single, derives working_title", async () => {
    const fake = makeFake({ data: { id: "new-id" }, error: null });
    fromMock.mockReturnValue(fake);
    const id = await createDraft("acct-A", { title: "  Hello  " });
    expect(id).toBe("new-id");
    expect(fake.inserted).toMatchObject({
      owner_account_id: "acct-A",
      mode: "single",
      working_title: "Hello",
    });
  });
});

describe("updateDraft", () => {
  it("filters by owner and id and returns false when no row matched", async () => {
    const fake = makeFake({ data: null, error: null });
    fromMock.mockReturnValue(fake);
    const ok = await updateDraft("acct-A", "d1", { title: "x" });
    expect(fake.eqCalls).toContainEqual(["owner_account_id", "acct-A"]);
    expect(fake.eqCalls).toContainEqual(["id", "d1"]);
    expect(ok).toBe(false);
  });
});

describe("deleteDraft", () => {
  it("filters by owner and id and returns true when a row matched", async () => {
    const fake = makeFake({ data: { id: "d1" }, error: null });
    fromMock.mockReturnValue(fake);
    const ok = await deleteDraft("acct-A", "d1");
    expect(fake.eqCalls).toContainEqual(["owner_account_id", "acct-A"]);
    expect(fake.eqCalls).toContainEqual(["id", "d1"]);
    expect(ok).toBe(true);
  });
});
