"use client";
import { useEffect, useMemo, useState } from "react";

type Props = {
  phrases: string[];
  /** Optional click handler — receives the phrase currently displayed. */
  onPick?: (phrase: string) => void;
  className?: string;
};

/**
 * Rotating type → hold → delete → next headline. Extracted from the sign-in
 * experience. Reduced-motion: renders the first phrase statically (no typing).
 * If onPick is set the rendered phrase is a button (used for the editor's
 * clickable idea-prompts).
 */
export function Typewriter({ phrases, onPick, className = "" }: Props) {
  const [reduced] = useState(
    () =>
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false,
  );
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [typed, setTyped] = useState(reduced ? phrases[0] ?? "" : "");
  const [phase, setPhase] = useState<"typing" | "holding" | "deleting">("typing");

  useEffect(() => {
    if (reduced) return;
    const phrase = phrases[phraseIdx] ?? "";
    let t: ReturnType<typeof setTimeout>;
    if (phase === "typing") {
      if (typed.length < phrase.length) t = setTimeout(() => setTyped(phrase.slice(0, typed.length + 1)), 38);
      else t = setTimeout(() => setPhase("holding"), 1400);
    } else if (phase === "holding") {
      t = setTimeout(() => setPhase("deleting"), 0);
    } else {
      if (typed.length > 0) t = setTimeout(() => setTyped(phrase.slice(0, typed.length - 1)), 22);
      else t = setTimeout(() => { setPhase("typing"); setPhraseIdx((i) => (i + 1) % phrases.length); }, 220);
    }
    return () => clearTimeout(t);
  }, [typed, phase, phraseIdx, phrases, reduced]);

  const widest = useMemo(() => phrases.reduce((a, b) => (b.length > a.length ? b : a), ""), [phrases]);
  const current = phrases[phraseIdx] ?? "";

  const body = (
    <span className="relative inline-block">
      <span aria-hidden className="pointer-events-none invisible whitespace-pre-wrap">{widest}</span>
      <span role="status" aria-live="polite" className="absolute inset-0 whitespace-pre-wrap">
        {typed}
        {!reduced && <span className="signin-caret" aria-hidden>|</span>}
      </span>
    </span>
  );

  if (onPick) {
    return (
      <button type="button" onClick={() => onPick(current)} className={className}>
        {body}
      </button>
    );
  }
  return <span className={className}>{body}</span>;
}
