import { NextResponse } from "next/server";
import { getValidSession, isJiraError, searchIssues } from "@/lib/jira";
import { ISSUE_KEY_REGEX } from "@/lib/jira/metadata";

export const runtime = "nodejs";

const MAX = 10;

function escapeJqlString(s: string): string {
  return s.replace(/["\\]/g, "\\$&");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cloudId = url.searchParams.get("cloudId");
  const q = url.searchParams.get("q");
  const projectKey = url.searchParams.get("projectKey");

  if (!cloudId) {
    return NextResponse.json({ error: "cloudId is required" }, { status: 400 });
  }
  if (!q || q.length < 2) {
    return NextResponse.json({ error: "q must be at least 2 chars" }, { status: 400 });
  }

  const escaped = escapeJqlString(q);
  const isKey = ISSUE_KEY_REGEX.test(q);
  const parts: string[] = isKey
    ? [`key = "${escaped}"`]
    : [`text ~ "${escaped}"`];
  if (projectKey) parts.unshift(`project = "${escapeJqlString(projectKey)}"`);
  const jql = parts.join(" AND ") + " ORDER BY updated DESC";

  try {
    const session = await getValidSession();
    const issues = await searchIssues(session.accessToken, cloudId, jql, MAX);
    return NextResponse.json({ issues });
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
