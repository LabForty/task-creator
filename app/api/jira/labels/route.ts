import { NextResponse } from "next/server";
import { getValidSession, isJiraError, searchLabels } from "@/lib/jira";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cloudId = url.searchParams.get("cloudId");
  const q = url.searchParams.get("q");
  const maxParam = url.searchParams.get("maxResults");

  if (!cloudId) {
    return NextResponse.json({ error: "cloudId is required" }, { status: 400 });
  }
  if (!q) {
    return NextResponse.json({ error: "q is required" }, { status: 400 });
  }
  const maxResults = Number.parseInt(maxParam ?? "20", 10);
  const max = Number.isFinite(maxResults) && maxResults > 0 ? Math.min(maxResults, 50) : 20;

  try {
    const session = await getValidSession();
    const labels = await searchLabels(session.accessToken, cloudId, q, max);
    return NextResponse.json({ labels });
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
