import { NextResponse } from "next/server";
import { getValidSession, isJiraError, listLinkTypes } from "@/lib/jira";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cloudId = url.searchParams.get("cloudId");
  if (!cloudId) {
    return NextResponse.json({ error: "cloudId is required" }, { status: 400 });
  }
  try {
    const session = await getValidSession();
    const linkTypes = await listLinkTypes(session.accessToken, cloudId);
    return NextResponse.json({ linkTypes });
  } catch (err) {
    if (isJiraError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 },
    );
  }
}
