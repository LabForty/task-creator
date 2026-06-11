import { NextResponse } from "next/server";
import type { Draft } from "@/lib/draft/autosave";
import { requireSession } from "@/lib/auth/requireSession";
import { DraftUpsertBodySchema } from "@/lib/drafts/schemas";
import { listDrafts, createDraft } from "@/lib/drafts/store";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";

// A missing Supabase config is an operator problem, not a user problem —
// name it instead of collapsing into the generic load/save failure (AI-50).
function storageUnavailable(): NextResponse | null {
  if (isSupabaseConfigured()) return null;
  return NextResponse.json(
    { error: "Drafts storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY." },
    { status: 503 },
  );
}

export async function GET() {
  const sessionOrRes = await requireSession();
  if (sessionOrRes instanceof NextResponse) return sessionOrRes;
  const unavailable = storageUnavailable();
  if (unavailable) return unavailable;
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
  const unavailable = storageUnavailable();
  if (unavailable) return unavailable;

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
    return NextResponse.json(
      { error: "We couldn't save your draft. Please try again." },
      { status: 500 },
    );
  }
}
