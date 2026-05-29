"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Editor } from "@/components/Editor";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { KneadingPanel } from "@/components/epic/KneadingPanel";
import { CapturedContext } from "@/components/epic/CapturedContext";
import { LostDoughWarning } from "@/components/epic/LostDoughWarning";
import { EpicEditingView } from "@/components/epic/EpicEditingView";
import { BackBar } from "@/components/epic/BackBar";
import {
  epicTaskNamespace, descriptorsFromProposed, seedsFromProposed,
  addEpicTask, deleteEpicTask, setTitle, setLabels as setTaskLabels,
  addLink as addTaskLink, removeLink as removeTaskLink, type EpicTask,
} from "@/lib/epic/tasks";
import { UploadSheet } from "@/components/epic/review/UploadSheet";
import type { UploadTask } from "@/lib/upload/types";
import type { ProposedSubtask } from "@/lib/subtasks/types";
import { startInterview, appendRound, setAnswer, skipQuestion, unskipQuestion, markComplete, resetDough } from "@/lib/epic/state";
import { EMPTY_KNEAD, type KneadState, type KneadAnswerValue } from "@/lib/knead/types";
import { RunSheet } from "@/components/RunSheet";
import { Preview } from "@/components/Preview";
import { HelpPanel } from "@/components/HelpPanel";
import { EditReviewSheet } from "@/components/EditReviewSheet";
import { Button } from "@/components/ui/Button";
import { JiraChip, type JiraSessionInfo } from "@/components/JiraChip";
import { JiraExport } from "@/components/JiraExport";
import { ThemeToggle } from "@/components/ThemeToggle";
import { subscribeToJob } from "@/lib/sse/client";
import { loadDraft, saveDraft, clearDraft, EMPTY_DRAFT } from "@/lib/draft/autosave";
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

  const [epicMode, setEpicMode] = useState(false);
  const [knead, setKnead] = useState<KneadState>(EMPTY_KNEAD);
  const [kneadLoading, setKneadLoading] = useState(false);
  const [kneadError, setKneadError] = useState<string | null>(null);
  const [capPrompt, setCapPrompt] = useState<{ justification: string } | null>(null);
  const [showLostDough, setShowLostDough] = useState(false);
  const [liveDraft, setLiveDraft] = useState<Draft | null>(null);
  const [epicTasks, setEpicTasks] = useState<EpicTask[]>([]);
  const [activeTab, setActiveTab] = useState<"epic" | string>("epic");
  const [taskRefreshKey, setTaskRefreshKey] = useState(0);
  // Per-task Help chat threads (one HelpMessage[] per epic task id). Hydrated
  // from each per-task draft's chatHistory on mount.
  const [analyzeChatById, setAnalyzeChatById] = useState<Record<string, HelpMessage[]>>({});
  const [analyzeTaskId, setAnalyzeTaskId] = useState<string | null>(null);
  const [walking, setWalking] = useState(false);
  const [generating, setGenerating] = useState(false);
  // (was subtasksError) — generation errors now surface via kneadError in the
  // KneadingPanel, which is still on screen when "Generate sub-tasks" is clicked.
  const [uploadOpen, setUploadOpen] = useState(false);

  const kneadRef = useRef(knead);
  useEffect(() => { kneadRef.current = knead; }, [knead]);
  const draftRef = useRef<Draft | null>(liveDraft);
  useEffect(() => { draftRef.current = liveDraft; }, [liveDraft]);
  // Once the user explicitly flips the header switch we stop adopting the
  // persisted draft's `mode` — their choice wins for the rest of the session.
  const modeTouchedRef = useRef(false);

  useEffect(() => {
    const d = loadDraft(NAMESPACE);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEpicMode(d.mode === "epic");
    if (d.knead) setKnead(d.knead);
    if (d.epicTasks) {
      setEpicTasks(d.epicTasks);
      // Hydrate each task's chatHistory into analyzeChatById.
      const map: Record<string, HelpMessage[]> = {};
      for (const t of d.epicTasks) {
        const taskDraft = loadDraft(epicTaskNamespace(t.id));
        if (taskDraft.chatHistory && taskDraft.chatHistory.length > 0) {
          map[t.id] = taskDraft.chatHistory;
        }
      }
      setAnalyzeChatById(map);
    }
    setLiveDraft(d);
  }, []);

  // The Editor hydrates its draft from localStorage one tick after mount and
  // pushes it up via onDraftChange. Until the user touches the switch, adopt
  // that hydrated mode — this also recovers from the Editor's mount-time
  // autosave of an empty (single) draft racing our own hydration read.
  useEffect(() => {
    if (modeTouchedRef.current || !liveDraft) return;
    setEpicMode(liveDraft.mode === "epic");
  }, [liveDraft]);

  function persistEpic(nextMode: boolean, nextKnead: KneadState) {
    const current = loadDraft(NAMESPACE);
    saveDraft(NAMESPACE, { ...current, mode: nextMode ? "epic" : "single", knead: nextKnead });
  }

  function persistEpicTasks(next: EpicTask[]) {
    const current = loadDraft(NAMESPACE);
    saveDraft(NAMESPACE, { ...current, epicTasks: next });
  }
  function commitEpicTasks(next: EpicTask[]) {
    setEpicTasks(next);
    persistEpicTasks(next);
  }

  function addTask() {
    const next = addEpicTask(epicTasks);
    const created = next[next.length - 1];
    saveDraft(epicTaskNamespace(created.id), { ...EMPTY_DRAFT });
    commitEpicTasks(next);
    setActiveTab(created.id);
  }

  function clearVisibleDraft() {
    // Decide which namespace the visible Editor is pointed at.
    // Single mode OR Epic tab → the main standalone namespace.
    // Epic sub-task tab → that task's per-task namespace.
    const ns =
      epicMode && epicTasks.length > 0 && activeTab !== "epic"
        ? epicTaskNamespace(activeTab)
        : NAMESPACE;

    if (ns === NAMESPACE) {
      const existing = loadDraft(NAMESPACE);
      // Preserve epic-mode metadata (mode/knead/epicTasks/chatHistory)
      // so clearing the visible draft doesn't blow away surrounding state.
      saveDraft(NAMESPACE, {
        ...EMPTY_DRAFT,
        mode: existing.mode,
        knead: existing.knead,
        epicTasks: existing.epicTasks,
        chatHistory: existing.chatHistory,
      });
      setLiveDraft(loadDraft(NAMESPACE));
    } else {
      const existing = loadDraft(ns);
      saveDraft(ns, { ...EMPTY_DRAFT, chatHistory: existing.chatHistory });
      // Mirror the cleared title back into the descriptor so the tab label updates.
      setEpicTasks((prev) => {
        const next = setTitle(prev, activeTab, "");
        persistEpicTasks(next);
        return next;
      });
    }
    // Force the Editor to re-hydrate from the just-cleared namespace.
    setTaskRefreshKey((k) => k + 1);
  }
  function startAnalyzeWalk() {
    if (epicTasks.length === 0) return;
    setHelpOpen(null);
    setWalking(true);
    setAnalyzeTaskId(epicTasks[0].id);
    setActiveTab(epicTasks[0].id);
  }

  function advanceWalk() {
    if (!walking || !analyzeTaskId) return;
    const i = epicTasks.findIndex((t) => t.id === analyzeTaskId);
    const next = epicTasks[i + 1];
    if (!next) { stopWalk(); return; }
    setAnalyzeTaskId(next.id);
    setActiveTab(next.id);
  }

  function stopWalk() {
    setWalking(false);
    setAnalyzeTaskId(null);
  }

  function updateAnalyzeChat(taskId: string, next: HelpMessage[]) {
    setAnalyzeChatById((prev) => ({ ...prev, [taskId]: next }));
    // Persist into the per-task draft so it survives reload.
    const ns = epicTaskNamespace(taskId);
    const existing = loadDraft(ns);
    saveDraft(ns, { ...existing, chatHistory: next });
  }

  function deleteTask(id: string) {
    clearDraft(epicTaskNamespace(id));
    const next = deleteEpicTask(epicTasks, id);
    commitEpicTasks(next);
    setAnalyzeChatById((prev) => { const m = { ...prev }; delete m[id]; return m; });
    if (analyzeTaskId === id) { setAnalyzeTaskId(null); setWalking(false); }
    if (activeTab === id) setActiveTab(next[0]?.id ?? "epic");
  }
  function taskTitleChange(id: string, title: string) {
    setEpicTasks((prev) => {
      if (prev.find((t) => t.id === id)?.title === title) return prev;
      const next = setTitle(prev, id, title);
      persistEpicTasks(next);
      return next;
    });
  }
  function taskSetLabels(id: string, labels: string[]) { commitEpicTasks(setTaskLabels(epicTasks, id, labels)); }
  function taskAddLink(a: string, b: string) { commitEpicTasks(addTaskLink(epicTasks, a, b)); }
  function taskRemoveLink(a: string, b: string) { commitEpicTasks(removeTaskLink(epicTasks, a, b)); }

  function startFinalize() {
    setUploadOpen(true);
  }

  function persistUploadedKey(id: string, issueKey: string, issueUrl: string) {
    setEpicTasks((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, uploadedIssueKey: issueKey, uploadedIssueUrl: issueUrl } : t));
      persistEpicTasks(next);
      return next;
    });
  }

  const doughIsStale =
    knead.rounds.length > 0 &&
    knead.sourceDescription !== undefined &&
    (liveDraft?.description ?? "") !== knead.sourceDescription;

  // Phase C will replace these with the real bake state + handlers.
  const bakeStatus: "idle" | "baking" | "baked" = "idle";
  const bakeProgress: Record<string, "pending" | "baking" | "baked" | "failed"> = {};
  const bakeErrors: Record<string, string> = {};
  function startBake() { /* Phase C */ }
  function cancelBake() { /* Phase C */ }

  // Derive the live list of pending edits from chatHistory minus the ones
  // the user already resolved. Later proposals with the same id supersede
  // earlier ones (so a refreshed Skill response keeps a single live entry).
  const pendingEdits = useMemo<ProposedEdit[]>(() => {
    const source = analyzeTaskId ? (analyzeChatById[analyzeTaskId] ?? []) : chatHistory;
    const byId = new Map<string, ProposedEdit>();
    for (const msg of source) {
      if (msg.role !== "assistant") continue;
      for (const s of msg.suggestions ?? []) {
        if (s.proposedEdit) byId.set(s.proposedEdit.id, s.proposedEdit);
      }
      if (msg.proposedEdit) byId.set(msg.proposedEdit.id, msg.proposedEdit);
    }
    return Array.from(byId.values()).filter((e) => !resolvedEditIds.has(e.id));
  }, [analyzeTaskId, analyzeChatById, chatHistory, resolvedEditIds]);

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

  // E2E-only escape hatch: tests call window.__E2E_SET_MODE__ to short-
  // circuit the Editor → Finalize → SSE path and jump straight into the
  // post-finalize Preview state. We always install the hook (it's cheap)
  // but production code never calls it.
  type E2ESetMode = (detail: {
    payload: FinalizedPayload;
    lastDraft: Draft;
    diagrams?: Diagrams;
  }) => void;
  useEffect(() => {
    if (typeof window === "undefined") return;
    const win = window as unknown as { __E2E_SET_MODE__?: E2ESetMode };
    win.__E2E_SET_MODE__ = (detail) => {
      if (detail.diagrams) setDiagrams(detail.diagrams);
      setMode({ kind: "done", payload: detail.payload, lastDraft: detail.lastDraft });
    };
    return () => {
      const w = window as unknown as { __E2E_SET_MODE__?: E2ESetMode };
      delete w.__E2E_SET_MODE__;
    };
  }, []);

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

  async function callKnead(rounds: KneadState["rounds"], overrideCapApproved: boolean) {
    const epicDescription = (draftRef.current?.description ?? "").replace(/<[^>]*>/g, "").trim();
    setKneadLoading(true);
    setKneadError(null);
    setCapPrompt(null);
    try {
      const res = await fetch("/api/knead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ epicDescription, rounds, overrideCapApproved }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.kind) {
        setKneadError(typeof json.error === "string" ? json.error : `Request failed (${res.status}).`);
        return;
      }
      if (json.kind === "questions") {
        setKnead((s) => { const next = appendRound(s, json.round.questions); persistEpic(true, next); return next; });
      } else if (json.kind === "complete") {
        setKnead((s) => { const next = markComplete(s); persistEpic(true, next); return next; });
      } else if (json.kind === "cap_reached") {
        setCapPrompt({ justification: json.justification });
      }
    } catch (e) {
      setKneadError(e instanceof Error ? e.message : "Network error");
    } finally {
      setKneadLoading(false);
    }
  }

  function startKneading(draft: Draft) {
    if (doughIsStale) { setShowLostDough(true); return; }
    const fresh = startInterview(EMPTY_KNEAD, draft.description);
    setKnead(fresh);
    persistEpic(true, fresh);
    void callKnead([], false);
  }

  function confirmReKnead(keepAnswers: boolean) {
    setShowLostDough(false);
    const kept = resetDough(kneadRef.current, keepAnswers);
    const fresh = startInterview(kept, draftRef.current?.description ?? "");
    const seeded: KneadState = keepAnswers ? { ...fresh, rounds: kept.rounds } : fresh;
    setKnead(seeded);
    persistEpic(true, seeded);
    for (const t of epicTasks) clearDraft(epicTaskNamespace(t.id));
    commitEpicTasks([]);
    setActiveTab("epic");
    setAnalyzeChatById({});
    setAnalyzeTaskId(null);
    setWalking(false);
    void callKnead(seeded.rounds, false);
  }

  function answerQuestion(qid: string, value: KneadAnswerValue) {
    setKnead((s) => { const next = setAnswer(s, qid, value); persistEpic(true, next); return next; });
  }

  function skipQuestionHandler(qid: string) {
    setKnead((s) => { const next = skipQuestion(s, qid); persistEpic(true, next); return next; });
  }

  function unskipQuestionHandler(qid: string) {
    setKnead((s) => { const next = unskipQuestion(s, qid); persistEpic(true, next); return next; });
  }

  async function generateSubtasks() {
    const epicDescription = (draftRef.current?.description ?? "").replace(/<[^>]*>/g, "").trim();
    setGenerating(true);
    setKneadError(null);
    try {
      const res = await fetch("/api/subtasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ epicDescription, rounds: kneadRef.current.rounds }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(json.subtasks)) {
        setKneadError(typeof json.error === "string" ? json.error : `Request failed (${res.status}).`);
        return;
      }
      const proposed = json.subtasks as ProposedSubtask[];
      const descriptors = descriptorsFromProposed(proposed);
      const seeds = seedsFromProposed(proposed, descriptors);
      for (const seed of seeds) {
        saveDraft(epicTaskNamespace(seed.id), {
          ...EMPTY_DRAFT,
          title: seed.title,
          description: seed.description,
          acceptanceCriteria: seed.acceptanceCriteria,
        });
      }
      commitEpicTasks(descriptors);
      setAnalyzeChatById({});
      setAnalyzeTaskId(null);
      setWalking(false);
      setActiveTab(descriptors[0]?.id ?? "epic");
    } catch (e) {
      setKneadError(e instanceof Error ? e.message : "Network error");
    } finally {
      setGenerating(false);
    }
  }

  function continueKneading() { void callKnead(kneadRef.current.rounds, false); }
  function approveCap() { void callKnead(kneadRef.current.rounds, true); }
  function declineCap() { setCapPrompt(null); }

  function onModeChange(next: "single" | "epic") {
    modeTouchedRef.current = true;
    setEpicMode(next === "epic");
    persistEpic(next === "epic", kneadRef.current);
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
          <ThemeToggle />
          {(mode.kind === "idle" || mode.kind === "running") && (
            <SegmentedControl<"single" | "epic">
              ariaLabel="Authoring mode"
              value={epicMode ? "epic" : "single"}
              items={[{ value: "single", label: "Single task" }, { value: "epic", label: "Epic" }]}
              onChange={onModeChange}
            />
          )}
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
          epicMode && epicTasks.length > 0 ? (
            <EpicEditingView
              epicTitle={liveDraft?.title ?? ""}
              epicDescriptionHtml={liveDraft?.description ?? ""}
              tasks={epicTasks}
              activeId={activeTab}
              refreshKey={taskRefreshKey}
              bakeStatus={bakeStatus}
              bakeProgress={bakeProgress}
              bakeErrors={bakeErrors}
              bakeDone={Object.values(bakeProgress).filter((s) => s === "baked").length}
              bakeTotal={epicTasks.length}
              analyzePanelOpen={Boolean(analyzeTaskId)}
              onSelectCard={(id) => {
                setActiveTab(id);
                // Closing the analyze panel when switching tasks is intentional — the
                // user can re-open it for the new task via Analyze all or Analyze this.
                if (analyzeTaskId && analyzeTaskId !== id) setAnalyzeTaskId(null);
              }}
              onAdd={addTask}
              onDelete={deleteTask}
              onCancelBake={cancelBake}
              onBack={() => confirmReKnead(false)}
              onAnalyzeAll={startAnalyzeWalk}
              onBake={startBake}
              onTitleChange={taskTitleChange}
              onSetLabels={taskSetLabels}
              onAddLink={taskAddLink}
              onRemoveLink={taskRemoveLink}
              onClearTask={(id) => {
                if (id === "epic") {
                  clearVisibleDraft();
                } else {
                  const ns = epicTaskNamespace(id);
                  const existing = loadDraft(ns);
                  saveDraft(ns, { ...EMPTY_DRAFT, chatHistory: existing.chatHistory });
                  setEpicTasks((prev) => {
                    const next = setTitle(prev, id, "");
                    persistEpicTasks(next);
                    return next;
                  });
                  setTaskRefreshKey((k) => k + 1);
                }
              }}
            />
          ) : (
          <div className="px-6 py-4 flex-1 min-h-0 flex flex-col w-full">
            {submitErr && (
              <div className="mb-3 rounded-md bg-danger/5 border border-danger/30 px-4 py-2.5 shrink-0" role="alert">
                <p className="text-hig-footnote text-danger">{submitErr}</p>
              </div>
            )}
            <div className="flex-1 min-h-0 flex gap-4">
              <div className="flex-1 min-w-0 overflow-y-auto max-w-5xl">
                {epicMode && knead.status !== "idle" && (
                  <BackBar
                    label="Back to editor"
                    confirmMessage="Discard kneading rounds and return to the editor?"
                    onBack={() => {
                      setKnead(EMPTY_KNEAD);
                      persistEpic(true, EMPTY_KNEAD);
                      setCapPrompt(null);
                      setKneadError(null);
                    }}
                  />
                )}
                <Editor
                  key={`standalone:${taskRefreshKey}`}
                  namespace={NAMESPACE}
                  onFinalize={submit}
                  disabled={mode.kind === "running"}
                  onHelp={() => { setAnalyzeTaskId(null); setWalking(false); setHelpOpen("editor"); }}
                  onClear={clearVisibleDraft}
                  mode={epicMode ? "epic" : "single"}
                  onKnead={startKneading}
                  kneadDisabled={kneadLoading}
                  onDraftChange={setLiveDraft}
                  taskTypeLocked={epicMode ? "epic" : undefined}
                />
                {epicMode && doughIsStale && !showLostDough && (
                  <p className="mt-3 text-hig-footnote text-warning">
                    Epic description edited — press “Knead tasks” to re-knead.
                  </p>
                )}
                {epicMode && showLostDough && (
                  <div className="mt-3">
                    <LostDoughWarning onConfirm={confirmReKnead} onCancel={() => setShowLostDough(false)} />
                  </div>
                )}
              </div>
              {epicMode && knead.rounds.length > 0 && (
                <aside aria-label="Captured context" className="w-[320px] shrink-0 border-l border-rule pl-4 overflow-y-auto">
                  <CapturedContext rounds={knead.rounds} />
                </aside>
              )}
            </div>
          </div>
          )
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
          onFinalized={(p) =>
            setMode({ kind: "done", payload: p, lastDraft: mode.lastDraft })
          }
          onGatesFailed={(p) =>
            setMode({ kind: "gates_failed", payload: p, lastDraft: mode.lastDraft })
          }
          onError={() => {
            /* error shown inline by RunSheet */
          }}
          onRetry={() => submit(mode.lastDraft)}
        />
      )}

      {epicMode && epicTasks.length === 0 && (mode.kind === "idle" || mode.kind === "running") && knead.status !== "idle" && (
        <KneadingPanel
          state={knead}
          loading={kneadLoading}
          error={kneadError}
          capPrompt={capPrompt}
          onAnswer={answerQuestion}
          onSkip={skipQuestionHandler}
          onUnskip={unskipQuestionHandler}
          onKnead={continueKneading}
          onApproveCap={approveCap}
          onDeclineCap={declineCap}
          onRetry={continueKneading}
          onGenerate={generateSubtasks}
          generating={generating}
        />
      )}

      {analyzeTaskId && (() => {
        const taskDraft = loadDraft(epicTaskNamespace(analyzeTaskId));
        const idx = epicTasks.findIndex((t) => t.id === analyzeTaskId);
        return (
          <HelpPanel
            // Force-remount on task change so the panel resets its internal
            // didScanRef + input/dismissed state and re-runs the auto-scan
            // for the new task. Without this, advancing the walk keeps the
            // same HelpPanel instance and the user sees no visible change.
            key={analyzeTaskId}
            surface="editor"
            draft={taskDraft}
            history={analyzeChatById[analyzeTaskId] ?? []}
            onUpdateHistory={(next) => updateAnalyzeChat(analyzeTaskId, next)}
            onClose={() => {
              if (walking) stopWalk();
              else setAnalyzeTaskId(null);
            }}
            pendingEditCount={pendingEdits.length}
            onOpenReview={() => setReviewOpen(true)}
            walkInfo={walking && idx >= 0 ? { index: idx, total: epicTasks.length, onNext: advanceWalk, onStop: stopWalk } : undefined}
          />
        );
      })()}

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
          draft={analyzeTaskId ? loadDraft(epicTaskNamespace(analyzeTaskId)) : loadDraft(NAMESPACE)}
          edits={pendingEdits}
          onApply={applyEdit}
          onApplyAll={applyAllEdits}
          onDiscard={discardEdit}
          onClose={() => setReviewOpen(false)}
        />
      )}
      {uploadOpen && (() => {
        const uploadTasks: UploadTask[] = epicTasks.map((t) => ({
          id: t.id,
          draft: loadDraft(epicTaskNamespace(t.id)),
          labels: t.labels,
        }));
        return (
          <UploadSheet
            tasks={uploadTasks}
            denied={[]}
            epicTitle={liveDraft?.title ?? ""}
            epicDescriptionHtml={liveDraft?.description ?? ""}
            onCancel={() => setUploadOpen(false)}
            onPersistUploaded={persistUploadedKey}
          />
        );
      })()}
    </main>
  );
}
