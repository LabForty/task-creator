"use client";

import { useEffect, useMemo, useState } from "react";
import { Editor } from "@/components/Editor";
import { RunSheet } from "@/components/RunSheet";
import { Preview } from "@/components/Preview";
import { HelpPanel } from "@/components/HelpPanel";
import { EditReviewSheet } from "@/components/EditReviewSheet";
import { Button } from "@/components/ui/Button";
import { JiraChip, type JiraSessionInfo } from "@/components/JiraChip";
import { JiraExport } from "@/components/JiraExport";
import { ThemeToggle } from "@/components/ThemeToggle";
import { subscribeToJob } from "@/lib/sse/client";
import { loadDraft, saveDraft, EMPTY_DRAFT } from "@/lib/draft/autosave";
import { upsertRequest, deleteDraftRequest } from "@/lib/drafts/client";
import { syncDiagramsInMarkdown } from "@/lib/render";
import type { Draft } from "@/lib/draft/autosave";
import type {
  AnalyzeFinding,
  Diagrams,
  FinalizedPayload,
  HelpMessage,
  MermaidFormat,
  ProposedEdit,
} from "@/lib/jobs/types";

// Keep the embedded `## Diagrams` section of payload.markdown in sync with
// the current `diagrams` state without clobbering the user's manual textarea
// edits to the rest of the body. Used after createDiagrams /
// regenerateDiagram / editDiagram / applyAnalysis (the analyzer also tweaks
// diagrams).
function payloadWithSyncedDiagrams(payload: FinalizedPayload, diagrams?: Diagrams): FinalizedPayload {
  return { ...payload, markdown: syncDiagramsInMarkdown(payload.markdown, diagrams) };
}

type Mode =
  | { kind: "idle" }
  | { kind: "running"; jobId: string; lastDraft: Draft }
  | { kind: "done"; payload: FinalizedPayload; lastDraft: Draft }
  | { kind: "gates_failed"; payload: FinalizedPayload; lastDraft: Draft }
  | { kind: "exporting"; payload: FinalizedPayload; lastDraft: Draft };

const NAMESPACE = "standalone";

type Props = {
  // Seed value from the server-side gate so the JiraChip renders with the
  // real account immediately instead of flashing "Jira…".
  initialSession: JiraSessionInfo;
};

export function StandaloneApp({ initialSession }: Props) {
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [diagrams, setDiagrams] = useState<Diagrams | undefined>(undefined);
  const [creatingDiagrams, setCreatingDiagrams] = useState(false);
  const [regeneratingFormat, setRegeneratingFormat] = useState<MermaidFormat | null>(null);
  const [diagramsErr, setDiagramsErr] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalyzeFinding[] | null>(null);
  const [applyingAnalysis, setApplyingAnalysis] = useState(false);
  const [helpOpen, setHelpOpen] = useState<null | "editor" | "diagrams">(null);
  const [chatHistory, setChatHistory] = useState<HelpMessage[]>([]);
  // Pending Help-proposed edits the user has not yet applied or discarded.
  // Lifted here so it survives Help-panel close/reopen and feeds the review
  // sheet. Drops an edit id when the user applies or discards it.
  const [resolvedEditIds, setResolvedEditIds] = useState<Set<string>>(new Set());
  const [reviewOpen, setReviewOpen] = useState(false);
  const [jiraSession, setJiraSession] = useState<JiraSessionInfo | null>(initialSession);
  const [jiraBanner, setJiraBanner] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftReloadToken, setDraftReloadToken] = useState(0);
  const [draftSavedNote, setDraftSavedNote] = useState<string | null>(null);

  // Derive the live list of pending edits from chatHistory minus the ones
  // the user already resolved. Later proposals with the same id supersede
  // earlier ones (so a refreshed Skill response keeps a single live entry).
  const pendingEdits = useMemo<ProposedEdit[]>(() => {
    const byId = new Map<string, ProposedEdit>();
    for (const msg of chatHistory) {
      if (msg.role !== "assistant") continue;
      for (const s of msg.suggestions ?? []) {
        if (s.proposedEdit) byId.set(s.proposedEdit.id, s.proposedEdit);
      }
      if (msg.proposedEdit) byId.set(msg.proposedEdit.id, msg.proposedEdit);
    }
    return Array.from(byId.values()).filter((e) => !resolvedEditIds.has(e.id));
  }, [chatHistory, resolvedEditIds]);

  function applyEdit(edit: ProposedEdit) {
    // The Editor component listens for this event and mutates its own
    // controlled draft. Keeping the apply path event-driven avoids lifting
    // the entire draft state up here.
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("task:apply-edit", { detail: { edit } }),
      );
    }
    setResolvedEditIds((prev) => {
      const next = new Set(prev);
      next.add(edit.id);
      return next;
    });
  }

  function applyAllEdits() {
    for (const edit of pendingEdits) applyEdit(edit);
    setReviewOpen(false);
  }

  function discardEdit(editId: string) {
    setResolvedEditIds((prev) => {
      const next = new Set(prev);
      next.add(editId);
      return next;
    });
  }

  useEffect(() => {
    let cancelled = false;
    async function refreshSession() {
      try {
        const res = await fetch("/api/jira/session", { credentials: "same-origin" });
        const json = await res.json();
        if (!cancelled) setJiraSession(json as JiraSessionInfo);
      } catch {
        if (!cancelled) setJiraSession({ configured: false, connected: false });
      }
    }
    (async () => {
      if (cancelled || typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      const draftParam = params.get("draft");
      if (draftParam) {
        try {
          const res = await fetch(`/api/drafts/${draftParam}`, { credentials: "same-origin" });
          if (res.status === 401) {
            window.location.href = `/signin?return=${encodeURIComponent(`/?draft=${draftParam}`)}`;
            return;
          }
          if (res.ok) {
            const json = await res.json();
            const payload = (json?.draft?.payload ?? {}) as Partial<Draft>;
            saveDraft(NAMESPACE, { ...EMPTY_DRAFT, ...payload });
            if (!cancelled) {
              setDraftId(draftParam);
              setDraftReloadToken((t) => t + 1);
            }
          } else if (!cancelled) {
            setSubmitErr("We couldn't open that draft. It may have been deleted.");
          }
        } catch {
          if (!cancelled) setSubmitErr("We couldn't open that draft. Please try again.");
        }
        const url = new URL(window.location.href);
        url.searchParams.delete("draft");
        window.history.replaceState({}, "", url.pathname + url.search + url.hash);
        // Keep the snapshot consistent so the ?jira block below doesn't
        // rebuild the URL with a stale `draft` param.
        params.delete("draft");
      }
      const jira = params.get("jira");
      if (jira === "connected") {
        setJiraBanner("Connected to Jira.");
      } else if (jira === "error") {
        const reason = params.get("reason");
        setJiraBanner(`Jira connection failed${reason ? `: ${reason}` : "."}`);
      }
      if (jira) {
        params.delete("jira");
        params.delete("reason");
        const next =
          window.location.pathname +
          (params.toString() ? `?${params.toString()}` : "") +
          window.location.hash;
        window.history.replaceState({}, "", next);
      }
    })();

    // Listen for the popup OAuth flow to complete.
    function onMessage(ev: MessageEvent) {
      if (ev.origin !== window.location.origin) return;
      const data = ev.data as { type?: string; outcome?: string; reason?: string | null } | null;
      if (!data || data.type !== "task-creator:jira") return;
      if (data.outcome === "connected") {
        setJiraBanner("Connected to Jira.");
        refreshSession();
      } else if (data.outcome === "error") {
        setJiraBanner(`Jira connection failed${data.reason ? `: ${data.reason}` : "."}`);
      }
    }
    window.addEventListener("message", onMessage);
    return () => {
      cancelled = true;
      window.removeEventListener("message", onMessage);
    };
  }, []);

  function updateChatHistory(next: HelpMessage[]) {
    setChatHistory(next);
    const current = loadDraft(NAMESPACE);
    saveDraft(NAMESPACE, { ...current, chatHistory: next });
  }

  // Persist diagrams into the draft's localStorage so they survive a refresh.
  function persistDiagrams(next: Diagrams | undefined) {
    setDiagrams(next);
    const current = loadDraft(NAMESPACE);
    saveDraft(NAMESPACE, { ...current, diagrams: next });
  }

  function editDiagram(format: MermaidFormat, source: string) {
    const next: Diagrams = { ...(diagrams ?? {}), [format]: source };
    persistDiagrams(next);
    // Refresh the inline `## Diagrams` block in the preview so the textarea
    // (and the Jira description that's built from it) reflects the user's
    // graphical / source edits. Other textarea edits are preserved.
    setMode((prev) => {
      if (prev.kind !== "done" && prev.kind !== "gates_failed") return prev;
      return { ...prev, payload: payloadWithSyncedDiagrams(prev.payload, next) };
    });
  }

  async function analyzeDiagrams() {
    if (mode.kind !== "done" && mode.kind !== "gates_failed") return;
    if (!diagrams) return;
    setDiagramsErr(null);
    setAnalyzing(true);
    try {
      const res = await fetch("/api/diagrams/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requirement: mode.payload.requirement,
          story: mode.payload.story,
          mermaid: diagrams,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.jobId) {
        setDiagramsErr(typeof json.error === "string" ? json.error : `Request failed (${res.status}).`);
        setAnalyzing(false);
        return;
      }
      const unsub = subscribeToJob(json.jobId, (e) => {
        if (e.type === "diagrams_analyzed") {
          setAnalysis(e.payload.findings);
          setAnalyzing(false);
          unsub();
        } else if (e.type === "error") {
          setDiagramsErr(e.message);
          setAnalyzing(false);
          unsub();
        }
      });
    } catch (e) {
      setDiagramsErr(e instanceof Error ? e.message : "Network error");
      setAnalyzing(false);
    }
  }

  function applyAnalysis(acceptedIds: string[]) {
    if (!analysis || !diagrams || mode.kind !== "done") return;
    setApplyingAnalysis(true);
    try {
      // Apply the proposedSync deltas locally for accepted findings. Note: this
      // does NOT re-run analyst/planner — the refreshed Story won't have passed
      // the schema gate after edits. Treat this as iteration UX; if you want a
      // gate-passing artifact, hit "Edit / start over" and re-Finalize.
      let nextDiagrams: Diagrams = { ...diagrams };
      const nextStory = { ...mode.payload.story };
      for (const id of acceptedIds) {
        const f = analysis.find((x) => x.id === id);
        if (!f?.proposedSync) continue;
        // The analyser used to return a structured acceptanceCriteria array
        // — with the template-driven pipeline the story body is opaque
        // markdown, so we can't surgically patch it from here. The user
        // edits the textarea directly to incorporate analyser findings.
        if (f.proposedSync.mermaid) nextDiagrams = { ...nextDiagrams, ...f.proposedSync.mermaid };
      }
      persistDiagrams(nextDiagrams);
      const nextPayload = payloadWithSyncedDiagrams(
        { ...mode.payload, story: nextStory },
        nextDiagrams,
      );
      setMode({ ...mode, payload: nextPayload });
      setAnalysis(null);
    } finally {
      setApplyingAnalysis(false);
    }
  }

  async function regenerateDiagram(format: MermaidFormat) {
    if (mode.kind !== "done" && mode.kind !== "gates_failed") return;
    setDiagramsErr(null);
    setRegeneratingFormat(format);
    try {
      const res = await fetch("/api/diagrams/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requirement: mode.payload.requirement,
          story: mode.payload.story,
          draft: mode.lastDraft,
          formats: [format],
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.jobId) {
        setDiagramsErr(typeof json.error === "string" ? json.error : `Request failed (${res.status}).`);
        setRegeneratingFormat(null);
        return;
      }
      const unsub = subscribeToJob(json.jobId, (e) => {
        if (e.type === "diagrams_created") {
          const next: Diagrams = { ...(diagrams ?? {}), ...e.payload };
          persistDiagrams(next);
          setMode((prev) => {
            if (prev.kind !== "done" && prev.kind !== "gates_failed") return prev;
            return { ...prev, payload: payloadWithSyncedDiagrams(prev.payload, next) };
          });
          setRegeneratingFormat(null);
          unsub();
        } else if (e.type === "error") {
          setDiagramsErr(e.message);
          setRegeneratingFormat(null);
          unsub();
        }
      });
    } catch (e) {
      setDiagramsErr(e instanceof Error ? e.message : "Network error");
      setRegeneratingFormat(null);
    }
  }

  async function submit(draft: Draft) {
    setSubmitErr(null);
    setDiagrams(undefined);
    try {
      const res = await fetch("/api/finalize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.jobId) {
        setSubmitErr(
          typeof json.error === "string" ? json.error : `Request failed with status ${res.status}.`,
        );
        return;
      }
      setMode({ kind: "running", jobId: json.jobId, lastDraft: draft });
    } catch (e) {
      setSubmitErr(e instanceof Error ? e.message : "Network error");
    }
  }

  async function saveAsDraft(draft: Draft) {
    setDraftSavedNote(null);
    const { url, method } = upsertRequest(draftId);
    try {
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ draft }),
      });
      if (res.status === 401) {
        window.location.href = `/signin?return=${encodeURIComponent("/")}`;
        return;
      }
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setSubmitErr(typeof json.error === "string" ? json.error : "We couldn't save your draft.");
        return;
      }
      if (method === "POST") {
        const json = await res.json().catch(() => ({}));
        if (typeof json.id === "string") setDraftId(json.id);
      }
      setDraftSavedNote("Draft saved. You can safely leave this page.");
    } catch {
      setSubmitErr("We couldn't save your draft. Please check your connection and try again.");
    }
  }

  async function createDiagrams() {
    if (mode.kind !== "done" && mode.kind !== "gates_failed") return;
    setDiagramsErr(null);
    setCreatingDiagrams(true);
    try {
      const res = await fetch("/api/diagrams/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requirement: mode.payload.requirement,
          story: mode.payload.story,
          draft: mode.lastDraft,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.jobId) {
        setDiagramsErr(
          typeof json.error === "string" ? json.error : `Request failed (${res.status}).`,
        );
        setCreatingDiagrams(false);
        return;
      }
      const unsub = subscribeToJob(json.jobId, (e) => {
        if (e.type === "diagrams_created") {
          persistDiagrams(e.payload);
          setMode((prev) => {
            if (prev.kind !== "done" && prev.kind !== "gates_failed") return prev;
            return { ...prev, payload: payloadWithSyncedDiagrams(prev.payload, e.payload) };
          });
          setCreatingDiagrams(false);
          unsub();
        } else if (e.type === "error") {
          setDiagramsErr(e.message);
          setCreatingDiagrams(false);
          unsub();
        }
      });
    } catch (e) {
      setDiagramsErr(e instanceof Error ? e.message : "Network error");
      setCreatingDiagrams(false);
    }
  }

  function reset() {
    setMode({ kind: "idle" });
    setDiagrams(undefined);
    setDiagramsErr(null);
    setCreatingDiagrams(false);
    setDraftSavedNote(null);
    setDraftId(null);
  }

  return (
    <main className="h-screen grid grid-cols-[1fr_auto_auto] bg-surface-subtle overflow-hidden">
      <div className="flex flex-col min-w-0 min-h-0">
        <header className="px-8 py-5 border-b border-rule bg-surface/80 backdrop-blur flex items-center gap-4 sticky top-0 z-10">
          <div className="flex flex-col">
            <h1 className="text-hig-title2 leading-tight">Task Creator</h1>
            <p className="text-hig-footnote text-ink-secondary mt-0.5">
              Turn an idea into a structured task with diagrams.
            </p>
          </div>
          <span className="flex-1" />
          <a
            href="/drafts"
            className="inline-flex items-center justify-center gap-1.5 rounded-md font-medium h-9 px-3.5 text-hig-subhead bg-surface-muted text-ink border border-rule hover:bg-surface-inset"
          >
            Drafts
          </a>
          <ThemeToggle />
          <JiraChip session={jiraSession} onSessionChange={setJiraSession} />
          {(mode.kind === "done" || mode.kind === "gates_failed") && (
            <Button variant="secondary" onClick={reset}>
              Edit / start over
            </Button>
          )}
        </header>
        {jiraBanner && (
          <div className="mx-6 mt-3 rounded-md bg-accent-tint border border-accent/30 px-4 py-2 shrink-0 flex items-center gap-2" role="status">
            <p className="text-hig-footnote text-ink flex-1">{jiraBanner}</p>
            <button
              type="button"
              onClick={() => setJiraBanner(null)}
              className="text-hig-footnote text-ink-secondary hover:text-ink"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}

        {mode.kind === "idle" || mode.kind === "running" ? (
          <div className="px-6 py-4 flex-1 min-h-0 flex flex-col max-w-5xl w-full">
            {submitErr && (
              <div className="mb-3 rounded-md bg-danger/5 border border-danger/30 px-4 py-2.5 shrink-0" role="alert">
                <p className="text-hig-footnote text-danger">{submitErr}</p>
              </div>
            )}
            {draftSavedNote && (
              <div className="mb-3 rounded-md bg-accent-tint border border-accent/30 px-4 py-2.5 shrink-0" role="status">
                <p className="text-hig-footnote text-accent">{draftSavedNote}</p>
              </div>
            )}
            <div className="flex-1 min-h-0">
              <Editor
                namespace={NAMESPACE}
                onFinalize={submit}
                onSaveDraft={saveAsDraft}
                reloadToken={draftReloadToken}
                disabled={mode.kind === "running"}
                onHelp={() => setHelpOpen("editor")}
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col">
            {diagramsErr && (
              <div className="mx-6 mt-3 rounded-md bg-danger/5 border border-danger/30 px-4 py-2 shrink-0" role="alert">
                <p className="text-hig-footnote text-danger">Diagram error: {diagramsErr}</p>
              </div>
            )}
            {mode.kind === "exporting" ? (
              <JiraExport
                payload={mode.payload}
                diagrams={diagrams}
                onCancel={() =>
                  setMode({ kind: "done", payload: mode.payload, lastDraft: mode.lastDraft })
                }
                onDone={() =>
                  setMode({ kind: "done", payload: mode.payload, lastDraft: mode.lastDraft })
                }
              />
            ) : (
              <Preview
                payload={mode.payload}
                diagrams={diagrams}
                onCreateDiagrams={createDiagrams}
                creatingDiagrams={creatingDiagrams}
                onEditDiagram={editDiagram}
                onRegenerateDiagram={regenerateDiagram}
                regeneratingFormat={regeneratingFormat}
                onAnalyzeDiagrams={analyzeDiagrams}
                analyzingDiagrams={analyzing}
                analysisFindings={analysis}
                onApplyAnalysis={applyAnalysis}
                applyingAnalysis={applyingAnalysis}
                onDismissAnalysis={() => setAnalysis(null)}
                onHelp={() => setHelpOpen("diagrams")}
                jiraConfigured={jiraSession?.configured ?? false}
                jiraConnected={jiraSession?.connected ?? false}
                onExportToJira={() => {
                  if (mode.kind === "done" || mode.kind === "gates_failed") {
                    setMode({ kind: "exporting", payload: mode.payload, lastDraft: mode.lastDraft });
                  }
                }}
                onMarkdownChange={(next) =>
                  setMode((prev) =>
                    prev.kind === "done" || prev.kind === "gates_failed"
                      ? { ...prev, payload: { ...prev.payload, markdown: next } }
                      : prev,
                  )
                }
              />
            )}
          </div>
        )}
      </div>

      {mode.kind === "running" && (
        <RunSheet
          jobId={mode.jobId}
          onFinalized={(p) => {
            setMode({ kind: "done", payload: p, lastDraft: mode.lastDraft });
            if (draftId) {
              const { url, method } = deleteDraftRequest(draftId);
              void fetch(url, { method, credentials: "same-origin" }).catch(() => {
                /* best-effort cleanup; the draft simply remains listed */
              });
              setDraftId(null);
            }
          }}
          onGatesFailed={(p) =>
            setMode({ kind: "gates_failed", payload: p, lastDraft: mode.lastDraft })
          }
          onError={() => {
            /* error shown inline by RunSheet */
          }}
          onRetry={() => submit(mode.lastDraft)}
        />
      )}

      {helpOpen && (
        <HelpPanel
          surface={helpOpen}
          draft={
            mode.kind === "done" || mode.kind === "gates_failed"
              ? mode.lastDraft
              : loadDraft(NAMESPACE)
          }
          diagrams={helpOpen === "diagrams" ? diagrams : undefined}
          history={chatHistory}
          onUpdateHistory={updateChatHistory}
          onClose={() => setHelpOpen(null)}
          pendingEditCount={pendingEdits.length}
          onOpenReview={() => setReviewOpen(true)}
        />
      )}
      {reviewOpen && (
        <EditReviewSheet
          draft={loadDraft(NAMESPACE)}
          edits={pendingEdits}
          onApply={applyEdit}
          onApplyAll={applyAllEdits}
          onDiscard={discardEdit}
          onClose={() => setReviewOpen(false)}
        />
      )}
    </main>
  );
}
