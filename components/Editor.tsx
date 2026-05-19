"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField, TextArea } from "@/components/ui/TextField";
import { Draft, EMPTY_DRAFT, isDirty, loadDraft, saveDraft } from "@/lib/draft/autosave";
import type { HelpFieldHint } from "@/lib/jobs/types";

type Props = {
  namespace: string;
  onFinalize: (draft: Draft) => void;
  disabled?: boolean;
  onHelp?: () => void;
};

const HIGHLIGHT_EVENT = "task:highlight-field";
const HIGHLIGHT_MS = 2500;

export function Editor({ namespace, onFinalize, disabled = false, onHelp }: Props) {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  // The acceptance-criteria textarea is bound to its raw text, not to a
  // re-serialized join of the array — otherwise every keystroke trims/filters
  // and the user can't type a trailing space or an empty line.
  const [acText, setAcText] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [suggestErr, setSuggestErr] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<HelpFieldHint | null>(null);

  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    const loaded = loadDraft(namespace);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(loaded);
    setAcText(loaded.acceptanceCriteria.join("\n"));
  }, [namespace]);

  // Save synchronously on every change — localStorage writes are cheap and
  // this guarantees the most recent keystroke is on disk if the tab is
  // closed or the server restarts mid-edit.
  useEffect(() => {
    saveDraft(namespace, draft);
  }, [namespace, draft]);

  useEffect(() => {
    // Belt-and-braces flush on tab close / hide. setTimeout(0) would be too
    // late here — `pagehide` is the last chance to write synchronously.
    const flush = () => saveDraft(namespace, draftRef.current);
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

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

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
      className="hig-card p-5 flex flex-col gap-4 h-full"
      onSubmit={(e) => {
        e.preventDefault();
        if (!draft.title.trim()) return;
        onFinalize(draft);
      }}
    >
      <header className="flex flex-col gap-0.5">
        <span className="hig-section-label">Draft</span>
        <h2 className="text-hig-title3">What needs to happen?</h2>
      </header>

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
        <div data-editor-field="description" className={`${cls("description")} flex flex-col`}>
          <TextArea
            label="Description"
            description="What the feature does, who triggers it, when, and why it matters."
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="What needs to happen, who triggers it, in what context, and why?"
            className="min-h-[140px] flex-1"
          />
        </div>

        <div data-editor-field="acceptanceCriteria" className={`${cls("acceptanceCriteria")} flex flex-col`}>
          <TextArea
            label="Acceptance criteria"
            description="One per line — testable, not implementation hints."
            value={acText}
            onChange={(e) => {
              const next = e.target.value;
              setAcText(next);
              set(
                "acceptanceCriteria",
                next.split("\n").map((l) => l.trim()).filter(Boolean),
              );
            }}
            placeholder={"- The endpoint returns 200 with a CSV body\n- 401 on invalid token"}
            className="min-h-[140px] flex-1"
          />
        </div>

        <div
          data-editor-field="constraints"
          className={`${cls("constraints")} flex flex-col lg:col-span-2`}
        >
          <TextArea
            label="Pay attention to"
            description="Hard limits, dependencies, things to preserve."
            value={draft.constraints}
            onChange={(e) => set("constraints", e.target.value)}
            placeholder="Reuse existing operator-session auth, no new permission system, …"
            className="min-h-[96px] flex-1"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-rule">
        {onHelp && (
          <Button type="button" variant="ghost" onClick={onHelp}>
            Help
          </Button>
        )}
        <Button type="submit" size="lg" disabled={disabled || !draft.title.trim()}>
          Finalize task
        </Button>
      </div>
    </form>
  );
}
