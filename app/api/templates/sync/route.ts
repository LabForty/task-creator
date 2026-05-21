import { NextResponse } from "next/server";
import { runSync } from "@/lib/templates/sync";
import { requireSession } from "@/lib/auth/requireSession";

export const runtime = "nodejs";
// This endpoint is intended for external cron + manual UI refresh; never
// cache the result.
export const dynamic = "force-dynamic";

export async function POST() {
  const sessionOrRes = await requireSession();
  if (sessionOrRes instanceof NextResponse) return sessionOrRes;

  const result = await runSync();
  const status = result.ok ? 200 : 502;
  return NextResponse.json(result, { status });
}
