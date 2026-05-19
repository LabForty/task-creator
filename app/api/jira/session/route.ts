import { NextResponse } from "next/server";
import { isConfigured, readSessionCookie } from "@/lib/jira";

export const runtime = "nodejs";

export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json({ configured: false, connected: false });
  }
  const session = await readSessionCookie();
  if (!session) {
    return NextResponse.json({ configured: true, connected: false });
  }
  return NextResponse.json({
    configured: true,
    connected: true,
    email: session.email ?? null,
    accountId: session.accountId,
    expiresAt: session.expiresAt,
  });
}
