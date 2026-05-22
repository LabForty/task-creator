import { NextResponse } from "next/server";
import { getValidSession, isJiraError, searchIssues } from "@/lib/jira";

export const runtime = "nodejs";

function escapeJqlString(s: string): string {
  return s.replace(/["\\]/g, "\\$&");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cloudId = url.searchParams.get("cloudId");
  const projectKey = url.searchParams.get("projectKey");
  const q = url.searchParams.get("q");
  if (!cloudId) return NextResponse.json({ error: "cloudId is required" }, { status: 400 });
  if (!projectKey) return NextResponse.json({ error: "projectKey is required" }, { status: 400 });

  const parts: string[] = [
    `project = "${escapeJqlString(projectKey)}"`,
    "issuetype = Epic",
    "statusCategory != Done",
  ];
  if (q && q.trim().length > 0) {
    const escaped = escapeJqlString(q.trim());
    parts.push(`(summary ~ "${escaped}" OR key = "${escaped}")`);
  }
  const jql = parts.join(" AND ") + " ORDER BY updated DESC";

  try {
    const session = await getValidSession();
    const epics = await searchIssues(session.accessToken, cloudId, jql, 50);
    return NextResponse.json({ epics });
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
