"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { subscribeToJob } from "@/lib/sse/client";
import type { JobEvent, FinalizedPayload } from "@/lib/jobs/types";

type Props = {
  jobId: string;
  onFinalized: (payload: FinalizedPayload) => void;
  onGatesFailed: (payload: FinalizedPayload) => void;
  onError: (message: string) => void;
  onRetry: () => void;
};

type IconKind = "play" | "dot" | "check" | "warn" | "error";

const ROLE_LABEL: Record<string, string> = {
  analyst: "Step 1",
  planner: "Step 2",
};

const ROLE_DESCRIPTION: Record<string, string> = {
  analyst: "Drafting a structured task description from your brief",
  planner: "Expanding it into a plan with acceptance criteria",
};

const GATE_LABEL: Record<string, string> = {
  validate: "Schema check",
  trace: "Internal consistency check",
};

// Events that represent low-level tool chatter (session started, using Read,
// streamed tokens). We hide these from the list and surface a single loader
// row instead, so the user knows work is happening without the noise.
function isChatter(e: JobEvent): boolean {
  return e.type === "role_progress" || e.type === "role_token";
}

function lineFor(e: JobEvent): { icon: IconKind; text: string } {
  switch (e.type) {
    case "role_started": {
      const label = ROLE_LABEL[e.role] ?? e.role;
      const desc = ROLE_DESCRIPTION[e.role] ?? "";
      return { icon: "play", text: desc ? `${label} starting — ${desc}…` : `${label} starting…` };
    }
    case "role_progress":
      return { icon: "dot", text: e.message };
    case "role_token":
      return { icon: "dot", text: e.token.slice(0, 80) + (e.token.length > 80 ? "…" : "") };
    case "gate_result": {
      const label = GATE_LABEL[e.gate] ?? e.gate;
      return {
        icon: e.ok ? "check" : "warn",
        text: e.ok ? `${label} passed` : `${label} failed`,
      };
    }
    case "role_finished": {
      const label = ROLE_LABEL[e.role] ?? e.role;
      return { icon: "check", text: `${label} done` };
    }
    case "finalized":
      return { icon: "check", text: "Finalized — the task is ready below" };
    case "gates_failed":
      return { icon: "warn", text: "Validation issues — showing partial result" };
    case "diagrams_created":
      return { icon: "check", text: "Diagrams ready" };
    case "diagrams_analyzed":
      return {
        icon: "check",
        text: `Analysis complete — ${e.payload.findings.length} ${
          e.payload.findings.length === 1 ? "finding" : "findings"
        }`,
      };
    case "diagrams_applied":
      return { icon: "check", text: "Changes applied" };
    case "help_progress":
      return { icon: "dot", text: e.message };
    case "help_message":
      return { icon: "dot", text: e.text.slice(0, 80) + (e.text.length > 80 ? "…" : "") };
    case "help_done":
      return { icon: "check", text: `Help done (${e.reason})` };
    case "error":
      return { icon: "error", text: e.message };
  }
}

const ICON_CLASS: Record<IconKind, string> = {
  play: "bg-accent text-white",
  dot: "bg-ink-quaternary text-white",
  check: "bg-success text-white",
  warn: "bg-warning text-white",
  error: "bg-danger text-white",
};

const ICON_GLYPH: Record<IconKind, string> = {
  play: "▶",
  dot: "·",
  check: "✓",
  warn: "!",
  error: "✕",
};

export function RunSheet({ jobId, onFinalized, onGatesFailed, onError, onRetry }: Props) {
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const unsub = subscribeToJob(jobId, (e) => {
      setEvents((prev) => [...prev, e]);
      if (e.type === "finalized") onFinalized(e.payload);
      else if (e.type === "gates_failed") onGatesFailed(e.payload);
      else if (e.type === "error") {
        setErrorMsg(e.message);
        onError(e.message);
      }
    });
    return unsub;
  }, [jobId, onFinalized, onGatesFailed, onError]);

  // Auto-scroll the events list to the bottom as new events arrive so the
  // newest step is always visible without the user chasing it.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [events.length]);

  const isTerminal = events.some(
    (e) =>
      e.type === "finalized" ||
      e.type === "gates_failed" ||
      e.type === "diagrams_analyzed" ||
      e.type === "diagrams_applied" ||
      e.type === "help_done" ||
      e.type === "error",
  );
  const showLoader = !isTerminal && !errorMsg;

  return (
    <aside
      aria-label="Finalize progress"
      className="sticky top-0 self-start border-l border-rule w-[420px] h-screen bg-surface flex flex-col"
    >
      <header className="px-6 pt-6 pb-4 border-b border-rule shrink-0 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-hig-title3">Finalizing…</h2>
          <span className="flex-1" />
          <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
        </div>
        <p className="text-hig-footnote text-ink-secondary leading-snug">
          Turning your brief into a structured task. This runs an AI pass to draft the
          shape, then validates the result before showing it to you.
        </p>
      </header>

      <ol
        ref={listRef}
        className="flex-1 min-h-0 overflow-y-auto px-6 py-4 flex flex-col gap-2.5"
      >
        {events.filter((e) => !isChatter(e)).map((e, i) => {
          const { icon, text } = lineFor(e);
          return (
            <li key={i} className="flex items-start gap-2.5 text-hig-footnote">
              <span
                className={
                  "shrink-0 mt-0.5 h-5 w-5 rounded-full inline-flex items-center justify-center text-[10px] font-bold " +
                  ICON_CLASS[icon]
                }
              >
                {ICON_GLYPH[icon]}
              </span>
              <span className={icon === "error" ? "text-danger" : "text-ink"}>{text}</span>
            </li>
          );
        })}
        {showLoader && (
          <li className="flex items-center gap-2.5 text-hig-footnote text-ink-secondary">
            <span className="shrink-0 mt-0.5 h-5 w-5 inline-flex items-center justify-center">
              <span className="h-3 w-3 rounded-full border-2 border-ink-quaternary border-t-accent animate-spin" />
            </span>
            <span className="inline-flex items-center gap-1">
              Working
              <span className="inline-flex gap-0.5">
                <span className="h-1 w-1 rounded-full bg-ink-quaternary animate-pulse [animation-delay:0ms]" />
                <span className="h-1 w-1 rounded-full bg-ink-quaternary animate-pulse [animation-delay:150ms]" />
                <span className="h-1 w-1 rounded-full bg-ink-quaternary animate-pulse [animation-delay:300ms]" />
              </span>
            </span>
          </li>
        )}
      </ol>

      {errorMsg && (
        <div className="m-6 mt-2 rounded-md bg-danger/5 border border-danger/30 px-4 py-3 flex flex-col gap-2 shrink-0">
          <p className="text-hig-footnote text-danger">{errorMsg}</p>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}
    </aside>
  );
}
