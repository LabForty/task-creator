"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Editor } from "@/components/Editor";
import { RunSheet } from "@/components/RunSheet";
import { Alert } from "@/components/ui/Alert";
import { AmbientBackground } from "@/components/AmbientBackground";
import { BrandMark } from "@/components/BrandMark";
import type { Draft } from "@/lib/draft/autosave";
import type { FinalizedPayload } from "@/lib/jobs/types";

type Mode =
  | { kind: "idle" }
  | { kind: "running"; jobId: string; lastDraft: Draft };

function EmbedInner() {
  const params = useSearchParams();
  const returnOrigin = params.get("returnOrigin");
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  // namespace draft per embed origin so two embedders on the same browser
  // don't collide on localStorage.
  const namespace = `embed:${returnOrigin ?? "default"}`;

  const urlErr = !returnOrigin
    ? "Embed requires ?returnOrigin=<host-page-origin> so we know where to postMessage results."
    : null;
  const err = submitErr ?? urlErr;

  async function submit(draft: Draft) {
    setSubmitErr(null);
    try {
      const res = await fetch("/api/finalize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.jobId) {
        setSubmitErr(
          typeof json.error === "string" ? json.error : `Request failed (${res.status}).`,
        );
        return;
      }
      setMode({ kind: "running", jobId: json.jobId, lastDraft: draft });
    } catch (e) {
      setSubmitErr(e instanceof Error ? e.message : "Network error");
    }
  }

  function postToParent(type: "task:finalized" | "task:gates_failed", payload: FinalizedPayload) {
    if (!returnOrigin) return;
    try {
      window.parent.postMessage({ type, payload }, returnOrigin);
    } catch {
      /* parent gone */
    }
  }

  // Reactive aurora: embed has no export, so only running vs idle.
  const auroraTone: "idle" | "running" = mode.kind === "running" ? "running" : "idle";

  return (
    <main className="relative isolate min-h-screen overflow-hidden p-6 bg-surface-subtle">
      <AmbientBackground tone={auroraTone} />
      <header className="mb-4 flex items-center gap-2.5">
        <BrandMark size={26} />
        <span className="text-hig-subhead font-semibold tracking-tight text-ink">Task Creator</span>
      </header>
      {err && (
        <Alert className="mb-4">{err}</Alert>
      )}
      <Editor namespace={namespace} onFinalize={submit} disabled={mode.kind === "running"} />
      {mode.kind === "running" && (
        <RunSheet
          jobId={mode.jobId}
          onFinalized={(p) => {
            postToParent("task:finalized", p);
            setMode({ kind: "idle" });
          }}
          onGatesFailed={(p) => {
            postToParent("task:gates_failed", p);
            setMode({ kind: "idle" });
          }}
          onError={() => {
            /* shown inline by RunSheet */
          }}
          onRetry={() => submit(mode.lastDraft)}
        />
      )}
    </main>
  );
}

export function EmbedApp() {
  return (
    <Suspense fallback={null}>
      <EmbedInner />
    </Suspense>
  );
}
