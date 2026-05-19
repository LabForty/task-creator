import { NextResponse } from "next/server";
import { getValidSession, isJiraError, listProjects } from "@/lib/jira";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cloudId = url.searchParams.get("cloudId");
  if (!cloudId) {
    return NextResponse.json({ error: "cloudId is required" }, { status: 400 });
  }
  try {
    const session = await getValidSession();
    const projects = await listProjects(session.accessToken, cloudId);
    return NextResponse.json({
      projects: projects.map((p) => ({
        id: p.id,
        key: p.key,
        name: p.name,
        avatarUrl: p.avatarUrls?.["24x24"] ?? null,
      })),
    });
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
