import { NextResponse } from "next/server";
import { listTemplates, maybeSyncInBackground, readIndex } from "@/lib/templates/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Fire-and-forget — never blocks the picker from rendering. The next
  // request will see the updated list.
  void maybeSyncInBackground();

  const [templates, idx] = await Promise.all([listTemplates(), readIndex()]);
  return NextResponse.json({
    lastSyncedAt: idx.lastSyncedAt,
    latestModified: idx.latestModified,
    templates,
  });
}
