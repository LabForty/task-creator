import { NextResponse } from "next/server";
import { AnalyzeDiagramsBodySchema } from "@/lib/api/schemas";
import { createJob, publish } from "@/lib/jobs";
import { makeTransport, runAnalyzeDiagrams } from "@/lib/agent";
import type { Requirement, Story } from "@/lib/pipeline";
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

  const parsed = AnalyzeDiagramsBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const job = createJob();
  const transport = makeTransport();

  runAnalyzeDiagrams({
    requirement: parsed.data.requirement as Requirement,
    story: parsed.data.story as Story,
    mermaid: parsed.data.mermaid as Diagrams,
    transport,
    publish: (e) => publish(job.id, e),
  }).catch((err) => {
    console.error(`runAnalyzeDiagrams crashed for job ${job.id}:`, err);
    publish(job.id, {
      type: "error",
      code: "E_ANALYZE",
      message: err instanceof Error ? err.message : String(err),
      retriable: true,
    });
  });

  return NextResponse.json({ jobId: job.id });
}
