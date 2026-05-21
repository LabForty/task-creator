import { NextResponse } from "next/server";
import { getJob, subscribe } from "@/lib/jobs";
import type { JobEvent } from "@/lib/jobs/types";
import { requireSession } from "@/lib/auth/requireSession";

export const runtime = "nodejs";

function isTerminalEvent(e: JobEvent): boolean {
  // Includes one-shot diagram/help completion events so their SSE streams
  // close as soon as the result arrives instead of leaking a subscription.
  return (
    e.type === "finalized" ||
    e.type === "gates_failed" ||
    e.type === "diagrams_created" ||
    e.type === "diagrams_analyzed" ||
    e.type === "diagrams_applied" ||
    e.type === "help_done" ||
    e.type === "error"
  );
}

function formatEvent(e: JobEvent): string {
  return `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Auth must clear before we construct the SSE ReadableStream — otherwise
  // the client sees an open event stream instead of a clean 401.
  const sessionOrRes = await requireSession();
  if (sessionOrRes instanceof NextResponse) return sessionOrRes;

  const { id } = await params;
  const job = getJob(id);
  if (!job) {
    return new Response("not found", { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const safeClose = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      // Replay any events the job already has, in order.
      let sawTerminal = false;
      for (const e of job.events) {
        controller.enqueue(encoder.encode(formatEvent(e)));
        if (isTerminalEvent(e)) sawTerminal = true;
      }

      // If the job is already terminal at subscribe time, close after replay.
      if (sawTerminal || job.status !== "running") {
        safeClose();
        return;
      }

      const unsub = subscribe(job.id, (e) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(formatEvent(e)));
        } catch {
          /* downstream closed; ignore */
        }
        if (isTerminalEvent(e)) {
          unsub();
          safeClose();
        }
      });

      // Client disconnect → tear down subscription.
      req.signal.addEventListener(
        "abort",
        () => {
          unsub();
          safeClose();
        },
        { once: true },
      );
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
