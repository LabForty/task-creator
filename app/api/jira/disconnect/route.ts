import { NextResponse } from "next/server";
import { clearSessionCookieOnResponse } from "@/lib/jira";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  clearSessionCookieOnResponse(res);
  return res;
}
