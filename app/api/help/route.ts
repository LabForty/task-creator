import { NextResponse } from "next/server";
import { HelpBodySchema } from "@/lib/api/schemas";
import { makeTransport, runHelp } from "@/lib/agent";
import type { Draft } from "@/lib/draft/autosave";
import type { Diagrams } from "@/lib/jobs/types";

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
  if (!isOriginAllowed(req)) {
    return NextResponse.json({ error: "origin not allowed" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = HelpBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const transport = makeTransport();
  try {
    const reply = await runHelp({
      surface: parsed.data.surface,
      state: {
        draft: parsed.data.state.draft as Draft,
        diagrams: parsed.data.state.diagrams as Diagrams | undefined,
      },
      conversation: parsed.data.conversation,
      transport,
      publish: () => {
        /* one-shot REST: events are not published to a job here */
      },
    });
    return NextResponse.json(reply);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
