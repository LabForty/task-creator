"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Editor } from "@/components/Editor";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { KneadingPanel } from "@/components/epic/KneadingPanel";
import { CapturedContext } from "@/components/epic/CapturedContext";
import { LostDoughWarning } from "@/components/epic/LostDoughWarning";
import { ReviewerMode } from "@/components/epic/review/ReviewerMode";
import { EpicTabs } from "@/components/epic/EpicTabs";
import {
  epicTaskNamespace, descriptorsFromProposed, seedsFromProposed,
  addEpicTask, deleteEpicTask, setTitle, setLabels as setTaskLabels,
  addLink as addTaskLink, removeLink as removeTaskLink, type EpicTask,
} from "@/lib/epic/tasks";
import { setReview, initReviews, pruneReviews } from "@/lib/review/state";
import type { ReviewMap, InterferenceMap, SubtaskReview } from "@/lib/review/types";
import { deleteSubtask, updateSubtask, setLabels, addLink, removeLink } from "@/lib/subtasks/state";
import type { SubTask, ProposedSubtask } from "@/lib/subtasks/types";
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
  const [subtasks, setSubtasks] = useState<SubTask[]>([]);
  const [epicTasks, setEpicTasks] = useState<EpicTask[]>([]);
  const [activeTab, setActiveTab] = useState<"epic" | string>("epic");
  const [tasksAnalyzing, setTasksAnalyzing] = useState(false);
  const [tasksAnalyzeProgress, setTasksAnalyzeProgress] = useState<string | null>(null);
  const [taskRefreshKey, setTaskRefreshKey] = useState(0);
  const [generating, setGenerating] = useState(false);
  // (was subtasksError) — generation errors now surface via kneadError in the
  // KneadingPanel, which is still on screen when "Generate sub-tasks" is clicked.
  const [reviewing, setReviewing] = useState(false);
  const [reviews, setReviews] = useState<ReviewMap>({});
  const [interference, setInterference] = useState<InterferenceMap>({});
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const interferenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Cancel any pending debounced interference call on unmount so it can't fire
  // setInterference after the component is gone.
  useEffect(() => () => { if (interferenceTimer.current) clearTimeout(interferenceTimer.current); }, []);

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
    if (d.subtasks) setSubtasks(d.subtasks);
    if (d.epicTasks) setEpicTasks(d.epicTasks);
    if (d.reviewing) setReviewing(true);
    if (d.reviews) setReviews(d.reviews);
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

  function persistSubtasks(next: SubTask[]) {
    const current = loadDraft(NAMESPACE);
    saveDraft(NAMESPACE, { ...current, subtasks: next });
  }
  function commitSubtasks(next: SubTask[]) {
    setSubtasks(next);
    persistSubtasks(next);
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
  function deleteTask(id: string) {
    clearDraft(epicTaskNamespace(id));
    const next = deleteEpicTask(epicTasks, id);
    commitEpicTasks(next);
    setReviews((prev) => { const m = { ...prev }; delete m[id]; persistReview(reviewing, m); return m; });
    setInterference((prev) => { const m = { ...prev }; delete m[id]; return m; });
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

  function persistReview(nextReviewing: boolean, nextReviews: ReviewMap) {
    const current = loadDraft(NAMESPACE);
    saveDraft(NAMESPACE, { ...current, reviewing: nextReviewing, reviews: nextReviews });
  }

  function bake() {
    const ids = subtasks.map((s) => s.id);
    const next = initReviews(ids, reviews);
    setReviews(next);
    setReviewing(true);
    setSelectedReviewId(ids[0] ?? null);
    persistReview(true, next);
  }

  function exitReview() {
    setReviewing(false);
    persistReview(false, reviews);
  }

  function changeReview(id: string, patch: Partial<SubtaskReview>) {
    setReviews((prev) => {
      const next = setReview(prev, id, patch);
      persistReview(true, next);
      return next;
    });
  }

  function scheduleInterference(editedId: string) {
    if (interferenceTimer.current) clearTimeout(interferenceTimer.current);
    interferenceTimer.current = setTimeout(async () => {
      const all = loadDraft(NAMESPACE).subtasks ?? [];
      const edited = all.find((s) => s.id === editedId);
      if (!edited) return;
      try {
        const res = await fetch("/api/interference", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            epicDescription: (draftRef.current?.description ?? "").replace(/<[^>]*>/g, "").trim(),
            editedSubtask: edited,
            allSubtasks: all,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(json.interference)) {
          const map: InterferenceMap = {};
          for (const w of json.interference) map[w.affectedTaskId] = w;
          setInterference(map);
        }
      } catch {
        /* advisory; ignore */
      }
    }, 400);
  }

  function reviewUpdate(id: string, patch: { title?: string; description?: string }) {
    commitSubtasks(updateSubtask(subtasks, id, patch));
    scheduleInterference(id);
  }
  function reviewSetLabels(id: string, labels: string[]) {
    commitSubtasks(setLabels(subtasks, id, labels));
    scheduleInterference(id);
  }
  function reviewAddLink(blockerId: string, blockedId: string) {
    commitSubtasks(addLink(subtasks, blockerId, blockedId));
    scheduleInterference(blockerId);
  }
  function reviewRemoveLink(blockerId: string, blockedId: string) {
    commitSubtasks(removeLink(subtasks, blockerId, blockedId));
    scheduleInterference(blockerId);
  }
  function reviewDelete(id: string) {
    const nextSubtasks = deleteSubtask(subtasks, id);
    commitSubtasks(nextSubtasks);
    setReviews((prev) => {
      const next = pruneReviews(prev, nextSubtasks.map((s) => s.id));
      persistReview(true, next);
      return next;
    });
    setInterference((prev) => { const n = { ...prev }; delete n[id]; return n; });
    if (selectedReviewId === id) setSelectedReviewId(nextSubtasks[0]?.id ?? null);
  }

  const doughIsStale =
    knead.rounds.length > 0 &&
    knead.sourceDescription !== undefined &&
    (liveDraft?.description ?? "") !== knead.sourceDescription;

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
    commitSubtasks([]);
    for (const t of epicTasks) clearDraft(epicTaskNamespace(t.id));
    commitEpicTasks([]);
    setActiveTab("epic");
    setReviewing(false);
    setReviews({});
    setInterference({});
    persistReview(false, {});
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
        });
      }
      commitEpicTasks(descriptors);
      setActiveTab(descriptors[0]?.id ?? "epic");
    } catch (e) {
      setKneadError(e instanceof Error ? e.message : "Network error");
    } finally {
      setGenerating(false);
    }
  }

  async function analyzeAll() {
    const epicDescription = (draftRef.current?.description ?? "").replace(/<[^>]*>/g, "").trim();
    setTasksAnalyzing(true);
    setKneadError(null);
    try {
      const tasks = epicTasks;
      for (let i = 0; i < tasks.length; i++) {
        setTasksAnalyzeProgress(`Analyzing ${i + 1}/${tasks.length}…`);
        const ns = epicTaskNamespace(tasks[i].id);
        const d = loadDraft(ns);
        const res = await fetch("/api/refine", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            epicDescription,
            draft: { title: d.title, description: d.description, acceptanceCriteria: d.acceptanceCriteria, constraints: d.constraints },
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || typeof json.title !== "string") {
          setKneadError(typeof json.error === "string" ? json.error : `Refine failed for task ${i + 1}.`);
          break;
        }
        saveDraft(ns, { ...d, title: json.title, description: json.description, acceptanceCriteria: json.acceptanceCriteria });
        setEpicTasks((prev) => { const next = setTitle(prev, tasks[i].id, json.title); persistEpicTasks(next); return next; });
      }
    } catch (e) {
      setKneadError(e instanceof Error ? e.message : "Network error");
    } finally {
      setTasksAnalyzing(false);
      setTasksAnalyzeProgress(null);
      setTaskRefreshKey((k) => k + 1);
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
          epicMode && reviewing ? (
            <ReviewerMode
              epicTitle={liveDraft?.title ?? ""}
              epicDescriptionHtml={liveDraft?.description ?? ""}
              subtasks={subtasks}
              reviews={reviews}
              interference={interference}
              selectedId={selectedReviewId}
              onSelect={setSelectedReviewId}
              onEditTasks={exitReview}
              onUpdate={reviewUpdate}
              onSetLabels={reviewSetLabels}
              onAddLink={reviewAddLink}
              onRemoveLink={reviewRemoveLink}
              onReviewChange={changeReview}
              onDelete={reviewDelete}
            />
          ) : epicMode && epicTasks.length > 0 ? (
            <div className="px-6 py-4 flex-1 min-h-0 flex flex-col max-w-5xl w-full">
              <EpicTabs
                tasks={epicTasks}
                active={activeTab}
                analyzing={tasksAnalyzing}
                analyzeProgress={tasksAnalyzeProgress}
                refreshKey={taskRefreshKey}
                onSelect={setActiveTab}
                onAdd={addTask}
                onAnalyzeAll={analyzeAll}
                onBake={bake}
                onTitleChange={taskTitleChange}
                onSetLabels={taskSetLabels}
                onAddLink={taskAddLink}
                onRemoveLink={taskRemoveLink}
                onDelete={deleteTask}
              />
            </div>
          ) : (
          <div className="px-6 py-4 flex-1 min-h-0 flex flex-col max-w-5xl w-full">
            {submitErr && (
              <div className="mb-3 rounded-md bg-danger/5 border border-danger/30 px-4 py-2.5 shrink-0" role="alert">
                <p className="text-hig-footnote text-danger">{submitErr}</p>
              </div>
            )}
            <div className="flex-1 min-h-0 overflow-y-auto">
              <Editor
                namespace={NAMESPACE}
                onFinalize={submit}
                disabled={mode.kind === "running"}
                onHelp={() => setHelpOpen("editor")}
                mode={epicMode ? "epic" : "single"}
                onKnead={startKneading}
                kneadDisabled={kneadLoading}
                onDraftChange={setLiveDraft}
              />
              {epicMode && (
                <>
                  {doughIsStale && !showLostDough && (
                    <p className="mt-3 text-hig-footnote text-warning">
                      Epic description edited — press “Knead tasks” to re-knead.
                    </p>
                  )}
                  {showLostDough && (
                    <div className="mt-3">
                      <LostDoughWarning onConfirm={confirmReKnead} onCancel={() => setShowLostDough(false)} />
                    </div>
                  )}
                  <CapturedContext rounds={knead.rounds} />
                </>
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

      {epicMode && !reviewing && epicTasks.length === 0 && (mode.kind === "idle" || mode.kind === "running") && knead.status !== "idle" && (
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
