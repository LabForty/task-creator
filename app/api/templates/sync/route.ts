import { NextResponse } from "next/server";
import { runSync } from "@/lib/templates/sync";

export const runtime = "nodejs";
// This endpoint is intended for external cron + manual UI refresh; never
// cache the result.
export const dynamic = "force-dynamic";

export async function POST() {
  const result = await runSync();
  const status = result.ok ? 200 : 502;
  return NextResponse.json(result, { status });
}
