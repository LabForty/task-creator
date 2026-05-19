import { NextResponse } from "next/server";
import { CreateDiagramsBodySchema } from "@/lib/api/schemas";
import { createJob, publish } from "@/lib/jobs";
import { makeTransport, runCreateDiagrams } from "@/lib/agent";
import type { Requirement, Story } from "@/lib/pipeline";
import type { Draft } from "@/lib/draft/autosave";

export const runtime = "nodejs";

function isOriginAllowed(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const raw = process.env.TASK_EMBED_ORIGINS ?? "";
  const allowlist = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (allowlist.length === 0) return true;
  return allowlist.includes(origin);
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

  const parsed = CreateDiagramsBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const job = createJob();
  const transport = makeTransport();

  runCreateDiagrams({
    requirement: parsed.data.requirement as Requirement,
    story: parsed.data.story as Story,
    draft: parsed.data.draft as Draft,
    formats: parsed.data.formats,
    transport,
    publish: (e) => publish(job.id, e),
  }).catch((err) => {
    console.error(`runCreateDiagrams crashed for job ${job.id}:`, err);
    publish(job.id, {
      type: "error",
      code: "E_DIAGRAMS",
      message: err instanceof Error ? err.message : String(err),
      retriable: true,
    });
  });

  return NextResponse.json({ jobId: job.id });
}
