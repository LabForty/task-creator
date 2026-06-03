import { NextResponse } from "next/server";
import type { Draft } from "@/lib/draft/autosave";
import { requireSession } from "@/lib/auth/requireSession";
import { DraftUpsertBodySchema } from "@/lib/drafts/schemas";
import { listDrafts, createDraft, DraftStoreError } from "@/lib/drafts/store";

export const runtime = "nodejs";

export async function GET() {
  const sessionOrRes = await requireSession();
  if (sessionOrRes instanceof NextResponse) return sessionOrRes;
  try {
    const drafts = await listDrafts(sessionOrRes.accountId);
    return NextResponse.json({ drafts });
  } catch (err) {
    console.error("[api/drafts] list failed:", err);
    return NextResponse.json(
      { error: "We couldn't load your drafts." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const sessionOrRes = await requireSession();
  if (sessionOrRes instanceof NextResponse) return sessionOrRes;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = DraftUpsertBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "We couldn't save your draft." }, { status: 400 });
  }
  try {
    const id = await createDraft(
      sessionOrRes.accountId,
      parsed.data.draft as Partial<Draft>,
    );
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    console.error("[api/drafts] create failed:", err);
    const msg = err instanceof DraftStoreError ? err.message : String(err);
    void msg;
    return NextResponse.json(
      { error: "We couldn't save your draft. Please try again." },
      { status: 500 },
    );
  }
}
