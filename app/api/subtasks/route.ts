import { NextResponse } from "next/server";
import { SubtasksBodySchema } from "@/lib/api/schemas";
import { makeTransport, runGenerateSubtasks } from "@/lib/agent";
import { requireSession } from "@/lib/auth/requireSession";
import { resolveSourceContext } from "@/lib/context/sources";
import type { SourceContextItem } from "@/lib/pipeline";

export const runtime = "nodejs";

function isOriginAllowed(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const raw = process.env.TASK_EMBED_ORIGINS ?? "";
  const allow = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (allow.length === 0) return true;
  return allow.includes(origin);
}

export async function POST(req: Request) {
  const sessionOrRes = await requireSession();
  if (sessionOrRes instanceof NextResponse) return sessionOrRes;

  if (!isOriginAllowed(req)) {
    return NextResponse.json({ error: "origin not allowed" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = SubtasksBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const transport = makeTransport();
  try {
    const sourceContext = await resolveLinks(parsed.data.contextLinks);
    const subtasks = await runGenerateSubtasks({
      epicDescription: parsed.data.epicDescription,
      rounds: parsed.data.rounds,
      sourceContext,
      transport,
    });
    return NextResponse.json({ subtasks });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

async function resolveLinks(links: readonly string[] | undefined): Promise<SourceContextItem[] | undefined> {
  if (!links?.length) return undefined;
  try {
    return await resolveSourceContext(links);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return links.map((url) => ({ url, kind: "web", status: "unresolved", error }));
  }
}
