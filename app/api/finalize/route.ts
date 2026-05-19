import { NextResponse } from "next/server";
import { FinalizeBodySchema } from "@/lib/api/schemas";
import { createJob } from "@/lib/jobs";
import { runFinalize } from "@/lib/finalize";

export const runtime = "nodejs";

// In-process per-IP allowlist: only one in-flight job per IP at a time.
// This is intentionally not Redis-backed in v1 — see PLAN.md Risks §5.
const inflightByIp = new Map<string, string>();

function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return "unknown";
}

function isOriginAllowed(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // same-origin / non-browser callers
  const raw = process.env.TASK_EMBED_ORIGINS ?? "";
  const allowlist = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowlist.length === 0) return true; // not configured → allow (dev default)
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

  const parsed = FinalizeBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const ip = getClientIp(req);
  if (inflightByIp.has(ip)) {
    return NextResponse.json(
      { error: "an in-flight job already exists for this client" },
      { status: 429 },
    );
  }

  const job = createJob();
  inflightByIp.set(ip, job.id);

  // Fire-and-forget: the orchestrator publishes events to the job store; the
  // caller observes progress via SSE /api/jobs/:id/stream.
  runFinalize({ jobId: job.id, draft: parsed.data.draft, options: parsed.data.options })
    .catch((err) => {
      console.error(`runFinalize crashed for job ${job.id}:`, err);
    })
    .finally(() => {
      inflightByIp.delete(ip);
    });

  return NextResponse.json({ jobId: job.id });
}

// Test-only helper. The Map is module-state; tests must reset between cases.
export function _clearInflightForTests(): void {
  inflightByIp.clear();
}
