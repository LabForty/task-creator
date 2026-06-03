import { NextResponse } from "next/server";
import type { Draft } from "@/lib/draft/autosave";
import { requireSession } from "@/lib/auth/requireSession";
import { DraftUpsertBodySchema } from "@/lib/drafts/schemas";
import { getDraft, updateDraft, deleteDraft } from "@/lib/drafts/store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const sessionOrRes = await requireSession();
  if (sessionOrRes instanceof NextResponse) return sessionOrRes;
  const { id } = await params;
  try {
    const draft = await getDraft(sessionOrRes.accountId, id);
    if (!draft) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ draft });
  } catch (err) {
    console.error("[api/drafts/:id] get failed:", err);
    return NextResponse.json({ error: "We couldn't open that draft." }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const sessionOrRes = await requireSession();
  if (sessionOrRes instanceof NextResponse) return sessionOrRes;
  const { id } = await params;

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
    const ok = await updateDraft(
      sessionOrRes.accountId,
      id,
      parsed.data.draft as Partial<Draft>,
    );
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ id });
  } catch (err) {
    console.error("[api/drafts/:id] update failed:", err);
    return NextResponse.json(
      { error: "We couldn't update your draft. Please try again." },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const sessionOrRes = await requireSession();
  if (sessionOrRes instanceof NextResponse) return sessionOrRes;
  const { id } = await params;
  try {
    const ok = await deleteDraft(sessionOrRes.accountId, id);
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[api/drafts/:id] delete failed:", err);
    return NextResponse.json(
      { error: "We couldn't delete your draft. Please try again." },
      { status: 500 },
    );
  }
}
