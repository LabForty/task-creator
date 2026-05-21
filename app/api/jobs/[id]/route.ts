import { NextResponse } from "next/server";
import { getJob } from "@/lib/jobs";
import { requireSession } from "@/lib/auth/requireSession";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sessionOrRes = await requireSession();
  if (sessionOrRes instanceof NextResponse) return sessionOrRes;

  const { id } = await params;
  const job = getJob(id);
  if (!job) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({
    status: job.status,
    result: job.result,
    error: job.error,
  });
}
