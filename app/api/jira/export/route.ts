import { NextResponse } from "next/server";
import {
  ExportBodySchema,
  exportToJira,
  getValidSession,
  isJiraError,
} from "@/lib/jira";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = ExportBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const session = await getValidSession();
    const result = await exportToJira(session.accessToken, parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    if (isJiraError(err)) {
      return NextResponse.json(
        { error: err.message, code: err.code, details: err.details ?? null },
        { status: err.status },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 },
    );
  }
}
