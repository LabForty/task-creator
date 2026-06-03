"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import dynamic from "next/dynamic";
import { TextField, TextArea } from "@/components/ui/TextField";
import { ACList } from "@/components/ACList";
import { ClearDraftButton } from "@/components/ClearDraftButton";
import { TaskTypePicker } from "@/components/TaskTypePicker";
import { applyEditToDraft } from "@/lib/draft/applyEdit";
import type { ProposedEdit } from "@/lib/jobs/types";

// TipTap + ProseMirror weighs ~110 KB gzipped. Split it out of the initial
// page bundle so the first paint stays fast. A skeleton block keeps the
// layout stable while the chunk fetches.
const RichTextDescription = dynamic(
  () => import("@/components/RichTextDescription").then((m) => m.RichTextDescription),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col gap-1.5">
        <span className="text-hig-subhead font-medium text-ink">Description</span>
        <div className="rounded-md border border-rule bg-surface min-h-[320px] animate-pulse" />
      </div>
    ),
  },
);
import { Draft, EMPTY_DRAFT, isDirty, loadDraft, saveDraft } from "@/lib/draft/autosave";
import type { HelpFieldHint } from "@/lib/jobs/types";

type Props = {
  namespace: string;
  onFinalize: (draft: Draft) => void;
  disabled?: boolean;
  onHelp?: () => void;
  onClear?: () => void;
  // Epic mode: relabel the primary button and gate on the epic description.
  mode?: "single" | "epic";
  onKnead?: (draft: Draft) => void;
  kneadDisabled?: boolean;
  onDraftChange?: (draft: Draft) => void;
  hideSubmit?: boolean;
  nested?: boolean;
  // Lock the task-type picker to a fixed value (e.g. "epic" when editing
  // the epic itself). Also pins draft.taskType to match so persistence is
  // consistent.
  taskTypeLocked?: string;
  // Save-as-draft: when provided, renders the control and is called with the
  // current draft. reloadToken forces a re-hydration from localStorage (used
  // when a saved draft is opened into this namespace).
  onSaveDraft?: (draft: Draft) => void;
  reloadToken?: number;
};

const HIGHLIGHT_EVENT = "task:highlight-field";
const HIGHLIGHT_MS = 2500;

// TipTap stores rich text as HTML; strip tags to decide whether the epic
// description has real content.
function hasEpicDescription(html: string): boolean {
  return html.replace(/<[^>]*>/g, "").trim().length > 0;
}

export function Editor({
  namespace, onFinalize, disabled = false, onHelp, onClear,
  mode = "single", onKnead, kneadDisabled = false, onDraftChange,
  hideSubmit = false, nested = false, taskTypeLocked,
  onSaveDraft, reloadToken,
}: Props) {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestErr, setSuggestErr] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<HelpFieldHint | null>(null);

  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // Track whether we've finished hydrating from localStorage. On the very
  // first render, `draft` is EMPTY_DRAFT (a controlled-component placeholder)
  // — letting the autosave/onDraftChange effects fire with that value would
  // (1) write an empty draft over the persisted one, briefly exposing a
  // window where any synchronous read of storage (e.g. `persistEpic` during
  // a Knead click landing immediately after page load) would see the wiped
  // description, and (2) push EMPTY_DRAFT up to the parent's `liveDraft`,
  // which would then propagate mode="single" / description="" back through
  // any prop derived from liveDraft. We gate both effects on `hydrated`.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const loaded = loadDraft(namespace);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(loaded);
    setHydrated(true);
  }, [namespace, reloadToken]);

  // Save synchronously on every change — localStorage writes are cheap and
  // this guarantees the most recent keystroke is on disk if the tab is
  // closed or the server restarts mid-edit.
  // mode/knead are owned by the parent (StandaloneApp) which persists them
  // separately; preserve whatever is already in storage so Editor's content
  // autosave never clobbers epic-mode state. Skip until hydrated so we don't
  // overwrite the persisted description with the initial EMPTY_DRAFT.
  useEffect(() => {
    if (!hydrated) return;
    const existing = loadDraft(namespace);
    saveDraft(namespace, { ...draft, mode: existing.mode, knead: existing.knead, epicTasks: existing.epicTasks, chatHistory: existing.chatHistory });
  }, [namespace, draft, hydrated]);

  const onDraftChangeRef = useRef(onDraftChange);
  useEffect(() => { onDraftChangeRef.current = onDraftChange; }, [onDraftChange]);
  // Skip the initial EMPTY_DRAFT push so the parent doesn't briefly see
  // mode="single" / description="" before hydration completes.
  useEffect(() => { if (hydrated) onDraftChangeRef.current?.(draft); }, [draft, hydrated]);

  // Refs let the flush handlers below stay stable (one set of listeners for
  // the component's lifetime) while still seeing the latest hydration state.
  const hydratedRef = useRef(hydrated);
  useEffect(() => { hydratedRef.current = hydrated; }, [hydrated]);

  useEffect(() => {
    // Belt-and-braces flush on tab close / hide. setTimeout(0) would be too
    // late here — `pagehide` is the last chance to write synchronously.
    const flush = () => {
      // Don't overwrite the persisted draft with EMPTY_DRAFT if the tab is
      // closed before hydration completes.
      if (!hydratedRef.current) return;
      const existing = loadDraft(namespace);
      saveDraft(namespace, { ...draftRef.current, mode: existing.mode, knead: existing.knead, epicTasks: existing.epicTasks, chatHistory: existing.chatHistory });
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      flush();
      if (isDirty(draftRef.current)) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [namespace]);

  // Listen for highlight requests from the Help panel.
  useEffect(() => {
    const onHighlight = (e: Event) => {
      const ce = e as CustomEvent<{ field: HelpFieldHint }>;
      const field = ce.detail?.field;
      if (!field) return;
      setHighlight(field);
      // Auto-focus the matching input/textarea so the user can start typing.
      const el = document.querySelector<HTMLElement>(
        `[data-editor-field="${field}"] [data-input]`,
      );
      el?.focus();
      window.setTimeout(() => setHighlight((cur) => (cur === field ? null : cur)), HIGHLIGHT_MS);
    };
    window.addEventListener(HIGHLIGHT_EVENT, onHighlight as EventListener);
    return () => window.removeEventListener(HIGHLIGHT_EVENT, onHighlight as EventListener);
  }, []);

  // Listen for Apply requests from the Help review sheet. The page dispatches
  // a 'task:apply-edit' event with a ProposedEdit; we run it through the pure
  // applyEditToDraft helper and update local state.
  useEffect(() => {
    const onApplyEdit = (e: Event) => {
      const ce = e as CustomEvent<{ edit: ProposedEdit }>;
      const edit = ce.detail?.edit;
      if (!edit) return;
      setDraft((prev) => applyEditToDraft(prev, edit));
      // Brief field flash so the user sees where the edit landed.
      setHighlight(edit.field);
      window.setTimeout(
        () => setHighlight((cur) => (cur === edit.field ? null : cur)),
        HIGHLIGHT_MS,
      );
    };
    window.addEventListener("task:apply-edit", onApplyEdit as EventListener);
    return () => window.removeEventListener("task:apply-edit", onApplyEdit as EventListener);
  }, []);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  // When the picker is locked (epic mode), keep draft.taskType in sync so the
  // persisted draft reflects the lock rather than whatever stale value was there.
  // This is a legitimate "sync external prop into local state" pattern: the
  // parent owns the lock value, and the Editor's controlled draft must follow.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (taskTypeLocked && draft.taskType !== taskTypeLocked) {
      set("taskType", taskTypeLocked);
    }
  }, [taskTypeLocked, draft.taskType]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function suggestTitle() {
    setSuggestErr(null);
    setSuggesting(true);
    try {
      const res = await fetch("/api/title/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          draft: {
            title: draft.title,
            description: draft.description,
            acceptanceCriteria: draft.acceptanceCriteria,
            constraints: draft.constraints,
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || typeof json.title !== "string") {
        setSuggestErr(typeof json.error === "string" ? json.error : `Request failed (${res.status}).`);
        return;
      }
      if (json.title.trim()) {
        set("title", json.title.trim());
      } else {
        setSuggestErr("Not enough context to suggest a title yet — add a description first.");
      }
    } catch (e) {
      setSuggestErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setSuggesting(false);
    }
  }

  const cls = (field: HelpFieldHint) =>
    highlight === field ? "task-highlight-field" : "";

  return (
    <form
      className={"hig-card p-5 flex flex-col gap-4 " + (nested ? "" : "h-full")}
      onSubmit={(e) => {
        e.preventDefault();
        if (hideSubmit) return;
        if (mode === "epic") {
          if (onKnead && hasEpicDescription(draft.description)) onKnead(draft);
          return;
        }
        if (!draft.title.trim()) return;
        onFinalize(draft);
      }}
    >
      <header className="flex flex-col gap-0.5">
        <span className="hig-section-label">Draft</span>
        <h2 className="text-hig-title3">What needs to happen?</h2>
      </header>

      <TaskTypePicker
        value={draft.taskType}
        onValueChange={(next) => set("taskType", next)}
        lockedTo={taskTypeLocked}
      />

      <div data-editor-field="title" className={cls("title")}>
        <div className="flex items-end gap-2">
          <div className="flex-1 min-w-0">
            <TextField
              label="Task title"
              description="Short, action-oriented. e.g. 'Export users as CSV'."
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Export users as CSV"
              autoFocus
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={suggestTitle}
            disabled={suggesting}
            title="Suggest a title from the description + acceptance criteria"
          >
            {suggesting ? "Suggesting…" : "Suggest"}
          </Button>
        </div>
        {suggestErr && (
          <p className="text-hig-footnote text-danger mt-1.5">{suggestErr}</p>
        )}
      </div>

      <div className={"flex flex-col gap-4 " + (nested ? "" : "flex-1 min-h-0 overflow-y-auto")}>
        <div data-editor-field="description" className={cls("description")}>
          <RichTextDescription
            label="Description"
            description="What needs to happen, who triggers it, when, in what context, and why it matters. Pour in raw context — the planner extracts structure."
            value={draft.description}
            onValueChange={(next) => set("description", next)}
            placeholder="What needs to happen, who triggers it, in what context, and why?"
          />
        </div>

        <div data-editor-field="acceptanceCriteria" className={cls("acceptanceCriteria")}>
          <ACList
            label="Acceptance criteria"
            description="One testable bullet per row. Outcomes the engineer/AI will verify against."
            value={draft.acceptanceCriteria}
            onItemsChange={(next) => set("acceptanceCriteria", next)}
            placeholder="e.g. The endpoint returns 200 with a CSV body"
          />
        </div>

        <div data-editor-field="constraints" className={`${cls("constraints")} flex flex-col`}>
          <TextArea
            label="Pay attention to"
            description="Hard limits, dependencies, things to preserve."
            value={draft.constraints}
            onChange={(e) => set("constraints", e.target.value)}
            placeholder="Reuse existing operator-session auth, no new permission system, …"
            className="min-h-[96px]"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-rule">
        {onHelp && (
          <Button type="button" variant="ghost" onClick={onHelp}>
            Help
          </Button>
        )}
        {onClear && <ClearDraftButton onConfirm={onClear} />}
        {onSaveDraft && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => onSaveDraft(draft)}
            disabled={disabled}
          >
            Save as draft
          </Button>
        )}
        {!hideSubmit && (mode === "epic" ? (
          <Button
            type="submit"
            size="lg"
            disabled={kneadDisabled || !hasEpicDescription(draft.description)}
          >
            Knead tasks
          </Button>
        ) : (
          <Button type="submit" size="lg" disabled={disabled || !draft.title.trim()}>
            Finalize task
          </Button>
        ))}
      </div>
    </form>
  );
}
