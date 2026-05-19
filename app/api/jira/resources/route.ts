import { NextResponse } from "next/server";
import {
  JiraError,
  getValidSession,
  isJiraError,
  listAccessibleResources,
} from "@/lib/jira";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getValidSession();
    const resources = await listAccessibleResources(session.accessToken);
    // Surface only Jira-write-capable sites.
    const writable = resources.filter((r) =>
      r.scopes.some((s) => s.startsWith("write:jira-work")),
    );
    return NextResponse.json({
      resources: writable.map((r) => ({ id: r.id, name: r.name, url: r.url })),
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
