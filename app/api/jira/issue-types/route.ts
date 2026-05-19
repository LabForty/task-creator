import { NextResponse } from "next/server";
import {
  getValidSession,
  isJiraError,
  listCreatableIssueTypes,
} from "@/lib/jira";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cloudId = url.searchParams.get("cloudId");
  const projectKey = url.searchParams.get("projectKey");
  if (!cloudId || !projectKey) {
    return NextResponse.json(
      { error: "cloudId and projectKey are required" },
      { status: 400 },
    );
  }
  try {
    const session = await getValidSession();
    const types = await listCreatableIssueTypes(session.accessToken, cloudId, projectKey);
    return NextResponse.json({
      issueTypes: types.map((t) => ({
        id: t.id,
        name: t.name,
        iconUrl: t.iconUrl ?? null,
        description: t.description ?? null,
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
