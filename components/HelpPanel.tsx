"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { Diagrams, HelpMessage, HelpSuggestion, HelpSuggestionKind } from "@/lib/jobs/types";
import type { Draft } from "@/lib/draft/autosave";

type Props = {
  surface: "editor" | "diagrams";
  draft: Draft;
  diagrams?: Diagrams;
  history: HelpMessage[];
  onUpdateHistory: (next: HelpMessage[]) => void;
  onClose: () => void;
};

const SUGGESTION_KIND_LABEL: Record<HelpSuggestionKind, string> = {
  missing_info: "Missing info",
  edge_case: "Edge case",
  alt_flow: "Alternative flow",
  mismatch: "Mismatch",
};

const SUGGESTION_KIND_CHIP: Record<HelpSuggestionKind, string> = {
  missing_info: "bg-warning/10 text-warning",
  edge_case: "bg-accent-tint text-accent",
  alt_flow: "bg-success/10 text-success",
  mismatch: "bg-danger/10 text-danger",
};

export function HelpPanel({ surface, draft, diagrams, history, onUpdateHistory, onClose }: Props) {
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const didScanRef = useRef(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [history.length, pending]);

  async function callHelp(conversation: HelpMessage[]): Promise<{
    text: string;
    done: boolean;
    suggestions?: HelpSuggestion[];
  } | null> {
    try {
      const res = await fetch("/api/help", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ surface, state: { draft, diagrams }, conversation }),
      });
      const json = await res.json();
      if (!res.ok || typeof json.text !== "string") {
        setError(typeof json.error === "string" ? json.error : `Request failed (${res.status}).`);
        return null;
      }
      return json as { text: string; done: boolean; suggestions?: HelpSuggestion[] };
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      return null;
    }
  }

  async function scan() {
    setError(null);
    setPending(true);
    try {
      const reply = await callHelp([]);
      if (!reply) return;
      const msg: HelpMessage = {
        role: "assistant",
        text: reply.text,
        suggestions: reply.suggestions,
      };
      onUpdateHistory([msg]);
      if (reply.done) onClose();
    } finally {
      setPending(false);
    }
  }

  // Auto-scan on first open with empty history: ask the Skill to surface
  // missing info / edge cases / alt flows up front, as actionable cards.
  /* eslint-disable react-hooks/set-state-in-effect -- scan() is the side-effect
     we WANT to fire on mount; it then triggers a network request and the
     state writes happen inside that async chain, not synchronously here. */
  useEffect(() => {
    if (didScanRef.current) return;
    if (history.length > 0) {
      didScanRef.current = true;
      return;
    }
    didScanRef.current = true;
    void scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function send() {
    const text = input.trim();
    if (!text || pending) return;
    setInput("");
    setError(null);
    const userTurn: HelpMessage = { role: "user", text };
    const baseHistory: HelpMessage[] = [...history, userTurn];
    onUpdateHistory(baseHistory);
    setPending(true);
    try {
      const reply = await callHelp(baseHistory);
      if (!reply) return;
      onUpdateHistory([...baseHistory, { role: "assistant", text: reply.text }]);
      if (reply.done) onClose();
    } finally {
      setPending(false);
    }
  }

  function discuss(suggestion: HelpSuggestion) {
    setDismissedIds((prev) => new Set(prev).add(suggestion.id));
    // Flash the targeted field on the editor surface so the user sees where
    // their answer is going. Diagrams surface has no editor — skip there.
    if (surface === "editor" && suggestion.fieldHint && typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("task:highlight-field", { detail: { field: suggestion.fieldHint } }),
      );
    }
    // Turn the suggestion into a user message so the follow-up chat thread
    // continues from the picked topic, then send.
    const userTurn: HelpMessage = { role: "user", text: suggestion.question };
    const baseHistory: HelpMessage[] = [...history, userTurn];
    onUpdateHistory(baseHistory);
    setPending(true);
    void (async () => {
      try {
        const reply = await callHelp(baseHistory);
        if (!reply) return;
        onUpdateHistory([...baseHistory, { role: "assistant", text: reply.text }]);
        if (reply.done) onClose();
      } finally {
        setPending(false);
      }
    })();
  }

  function dismiss(suggestion: HelpSuggestion) {
    setDismissedIds((prev) => new Set(prev).add(suggestion.id));
  }

  return (
    <aside
      aria-label="Help"
      className="sticky top-0 self-start border-l border-rule w-[400px] h-screen flex flex-col bg-surface overflow-hidden"
    >
      <header className="px-5 py-4 border-b border-rule flex flex-col gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex flex-col">
            <span className="hig-section-label">Help</span>
            <h2 className="text-hig-headline">Ask anything</h2>
          </div>
          <span className="flex-1" />
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <p className="text-hig-footnote text-ink-secondary leading-snug">
          {surface === "editor"
            ? "Help reads your current draft and asks one focused question at a time — missing flows, edge cases, ambiguity."
            : "Help reads your current draft + diagrams and asks one focused question at a time."}
        </p>
      </header>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto px-5 py-4 flex flex-col gap-3">
        {history.length === 0 && !pending && (
          <div className="rounded-md bg-surface-muted p-4">
            <p className="text-hig-subhead text-ink">
              Scanning the {surface === "editor" ? "draft" : "draft + diagrams"} for gaps…
            </p>
            <p className="text-hig-footnote text-ink-secondary mt-2">
              I&apos;ll surface missing info, edge cases, and alternative flows you can
              discuss or dismiss.
            </p>
          </div>
        )}
        {history.map((m, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div
              className={
                "rounded-2xl px-3.5 py-2.5 text-hig-subhead leading-snug max-w-[85%] " +
                (m.role === "user"
                  ? "bg-accent text-white self-end rounded-br-md"
                  : "bg-surface-muted text-ink self-start rounded-bl-md")
              }
            >
              {m.text}
            </div>
            {m.role === "assistant" && m.suggestions && m.suggestions.length > 0 && (
              <ul className="flex flex-col gap-2 self-start max-w-[95%]">
                {m.suggestions
                  .filter((s) => !dismissedIds.has(s.id))
                  .map((s) => (
                    <li
                      key={s.id}
                      className="rounded-lg border border-rule bg-surface p-3 flex flex-col gap-2"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            "inline-flex items-center text-[10px] font-semibold uppercase tracking-wide " +
                            "px-2 py-0.5 rounded-sm " +
                            SUGGESTION_KIND_CHIP[s.kind]
                          }
                        >
                          {SUGGESTION_KIND_LABEL[s.kind]}
                        </span>
                        <span className="text-hig-footnote font-medium text-ink truncate">
                          {s.title}
                        </span>
                      </div>
                      <p className="text-hig-footnote text-ink-secondary leading-snug">
                        {s.question}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => discuss(s)}
                          disabled={pending}
                        >
                          Discuss
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => dismiss(s)}>
                          Ignore
                        </Button>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        ))}
        {pending && (
          <div className="self-start bg-surface-muted rounded-2xl rounded-bl-md px-3.5 py-2.5 inline-flex gap-1 items-center">
            <span className="h-1.5 w-1.5 rounded-full bg-ink-tertiary animate-pulse [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 rounded-full bg-ink-tertiary animate-pulse [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 rounded-full bg-ink-tertiary animate-pulse" />
          </div>
        )}
        {error && (
          <div className="rounded-md bg-danger/5 border border-danger/30 px-3 py-2" role="alert">
            <p className="text-hig-footnote text-danger">{error}</p>
          </div>
        )}
      </div>

      <form
        className="border-t border-rule px-4 py-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="What's missing?"
          className={
            "flex-1 h-10 px-3.5 rounded-full bg-surface-muted border border-rule " +
            "text-hig-body text-ink placeholder:text-ink-tertiary " +
            "focus:outline-none focus:border-accent focus:shadow-focus " +
            "transition-all duration-150 ease-hig"
          }
        />
        <Button type="submit" disabled={pending || !input.trim()}>
          Send
        </Button>
      </form>
    </aside>
  );
}
