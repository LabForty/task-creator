"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";

type Props = {
  configured: boolean;
  error: string | null;
  connectHref: string;
};

const BRAND_RED = "#ED3B3B"; // design-tokens-allow: LabForty brand mark

const ROTATING_PHRASES = [
  "Turn ideas into stories.",
  "Generate diagrams.",
  "Ship straight to Jira.",
];

const HUMAN_ERROR: Record<string, string> = {
  jira_not_configured:
    "Jira isn't configured on this server. Set JIRA_CLIENT_ID, JIRA_CLIENT_SECRET, and JIRA_COOKIE_SECRET in the environment.",
  not_authenticated: "Your session expired. Sign in again to continue.",
  session_expired:
    "Your Jira session expired and couldn't be refreshed. Sign in again to continue.",
};

function prettifyError(raw: string | null): string | null {
  if (!raw) return null;
  if (HUMAN_ERROR[raw]) return HUMAN_ERROR[raw];
  // Atlassian error responses are usually short — show them verbatim, capped.
  return raw.length > 240 ? raw.slice(0, 240) + "…" : raw;
}

export function SigninExperience({ configured, error, connectHref }: Props) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const niceError = useMemo(() => prettifyError(error), [error]);

  // ── Mouse-following spotlight on the card ──────────────────────────────
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      el.style.setProperty("--spot-x", `${x}%`);
      el.style.setProperty("--spot-y", `${y}%`);
    };
    const onLeave = () => {
      el.style.setProperty("--spot-x", `50%`);
      el.style.setProperty("--spot-y", `0%`);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    el.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  // ── Rotating headline (typewriter) ─────────────────────────────────────
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<"typing" | "holding" | "deleting">("typing");

  useEffect(() => {
    const phrase = ROTATING_PHRASES[phraseIdx];
    let timeout: ReturnType<typeof setTimeout>;

    if (phase === "typing") {
      if (typed.length < phrase.length) {
        timeout = setTimeout(() => setTyped(phrase.slice(0, typed.length + 1)), 38);
      } else {
        timeout = setTimeout(() => setPhase("holding"), 1400);
      }
    } else if (phase === "holding") {
      timeout = setTimeout(() => setPhase("deleting"), 0);
    } else {
      if (typed.length > 0) {
        timeout = setTimeout(() => setTyped(phrase.slice(0, typed.length - 1)), 22);
      } else {
        timeout = setTimeout(() => {
          setPhase("typing");
          setPhraseIdx((i) => (i + 1) % ROTATING_PHRASES.length);
        }, 220);
      }
    }
    return () => clearTimeout(timeout);
  }, [typed, phase, phraseIdx]);

  // Stable widest phrase so the headline doesn't reflow as text grows/shrinks.
  const widestPhrase = useMemo(
    () => ROTATING_PHRASES.reduce((a, b) => (b.length > a.length ? b : a)),
    [],
  );

  return (
    <main className="signin-shell relative min-h-screen overflow-hidden">
      {/* ── Aurora background ─────────────────────────────────────────── */}
      <div aria-hidden className="signin-aurora absolute inset-0 -z-10">
        <span className="signin-blob signin-blob--a" />
        <span className="signin-blob signin-blob--b" />
        <span className="signin-blob signin-blob--c" />
        <div className="signin-grid absolute inset-0" />
        <div className="signin-vignette absolute inset-0" />
      </div>

      {/* ── Top bar ───────────────────────────────────────────────────── */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5">
        <a
          href="https://labforty.com"
          target="_blank"
          rel="noreferrer noopener"
          className="group flex items-center gap-3 outline-none"
          aria-label="LabForty — Task Creator"
        >
          <LabFortyMark size={36} />
          <span className="flex flex-col leading-tight">
            <span className="text-hig-subhead font-semibold tracking-tight text-ink">
              Task Creator
            </span>
            <span className="text-hig-caption text-ink-tertiary">
              by <span className="text-ink-secondary group-hover:text-ink transition-colors">LabForty</span>
            </span>
          </span>
        </a>
        <ThemeToggle />
      </header>

      {/* ── Hero card ─────────────────────────────────────────────────── */}
      <section className="relative z-10 flex min-h-[calc(100vh-5rem)] items-center justify-center px-6 pb-12">
        <div
          ref={cardRef}
          className="signin-card relative w-full max-w-md rounded-xl border border-rule bg-surface/70 p-8 shadow-elevated backdrop-blur-xl sm:p-10"
        >
          {/* Eyebrow */}
          <p className="hig-section-label mb-7">For makers · developers · drafters · PMs</p>

          {/* Rotating headline */}
          <h1 className="text-hig-large leading-[1.05] text-ink">
            <span
              aria-hidden
              className="pointer-events-none invisible block whitespace-pre-wrap"
            >
              {widestPhrase}
            </span>
            <span
              className="absolute inset-x-8 top-[3.7rem] block whitespace-pre-wrap sm:inset-x-10"
              aria-live="polite"
            >
              {typed}
              <span className="signin-caret" aria-hidden>
                |
              </span>
            </span>
          </h1>

          {/* Supporting copy */}
          <p className="mt-5 text-hig-subhead text-ink-secondary">
            Sign in with your Atlassian account to turn rough ideas into
            Jira-ready stories with diagrams — drafted, reviewed, exported in
            one place.
          </p>

          {/* Error chip */}
          {niceError && (
            <div
              role="alert"
              className="mt-5 rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-hig-footnote text-danger"
            >
              {niceError}
            </div>
          )}

          {/* CTA */}
          <div className="mt-7">
            {configured ? (
              <a
                href={connectHref}
                target="_top"
                rel="noopener"
                className="signin-cta group relative inline-flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-lg bg-accent px-5 text-hig-headline text-white shadow-card transition-all duration-150 ease-hig hover:bg-accent-hover active:bg-accent-pressed active:scale-[0.99] focus-visible:outline-none focus-visible:shadow-focus"
              >
                <JiraGlyph />
                <span>Continue with Jira</span>
                <ArrowRight />
                <span aria-hidden className="signin-cta-sheen" />
              </a>
            ) : (
              <div
                role="status"
                className="flex h-12 w-full items-center justify-center rounded-lg border border-rule bg-surface-muted px-5 text-hig-footnote text-ink-tertiary"
              >
                Jira is not configured on this server
              </div>
            )}
          </div>

          {/* Footnote */}
          <p className="mt-5 text-hig-caption leading-relaxed text-ink-tertiary">
            We open Atlassian&apos;s OAuth screen and store the resulting
            session encrypted on this server. No passwords are ever seen by
            Task Creator.
          </p>

          {/* Capability ribbon */}
          <ul className="mt-7 grid grid-cols-3 gap-2 border-t border-rule pt-5 text-center text-hig-caption text-ink-tertiary">
            <li className="flex flex-col items-center gap-1.5">
              <PencilIcon />
              Drafts
            </li>
            <li className="flex flex-col items-center gap-1.5">
              <DiagramIcon />
              Diagrams
            </li>
            <li className="flex flex-col items-center gap-1.5">
              <ExportIcon />
              Jira-ready
            </li>
          </ul>
        </div>
      </section>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Inline SVG bits — no extra deps, no external logo assets.
// ─────────────────────────────────────────────────────────────────────────

// LabForty wordmark glyph — hexagonal frame interrupted by </> brackets with
// a red diamond at its core. Strokes use currentColor so the parent's text
// color (which already switches with the theme) drives light/dark adaptation
// — the diamond's brand red stays constant in both modes. Hover spins the
// frame 60° (the next hex symmetry angle), the diamond breathes constantly,
// and a soft red glow blooms under the cursor.
function LabFortyMark({ size = 36 }: { size?: number }) {
  return (
    <span className="labforty-mark inline-block text-ink" style={{ width: size, height: size }}>
      <svg
        viewBox="0 0 100 100"
        width="100%"
        height="100%"
        fill="none"
        aria-hidden
      >
        <g
          className="labforty-mark__hex"
          stroke="currentColor"
          strokeWidth="4.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        >
          {/* Hex outline */}
          <path d="M 50 6 L 88 28 L 88 72 L 50 94 L 12 72 L 12 28 Z" />
          {/* Left chevron — '<' */}
          <path d="M 30 32 L 16 50 L 30 68" />
          {/* Right chevron — '>' */}
          <path d="M 70 32 L 84 50 L 70 68" />
        </g>
        <path
          className="labforty-mark__diamond"
          d="M 50 22 L 60 50 L 50 78 L 40 50 Z"
          fill={BRAND_RED}
        />
      </svg>
    </span>
  );
}

function JiraGlyph() {
  // Abstract spark, not the real Atlassian/Jira logo (trademark-safe).
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="opacity-95"
    >
      <path
        d="M12 2.5l2.3 6.9 6.9 2.3-6.9 2.3L12 21l-2.3-7-6.9-2.3 6.9-2.3L12 2.5z"
        fill="currentColor"
        opacity="0.95"
      />
    </svg>
  );
}

function ArrowRight() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="ml-0.5 transition-transform duration-200 group-hover:translate-x-0.5"
    >
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 21l3.5-1 11-11-2.5-2.5-11 11L3 21z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M14 6l4 4" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function DiagramIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="4" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="15" y="4" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="9" y="14" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 7h6M6 10v2a2 2 0 002 2h1M18 10v2a2 2 0 01-2 2h-1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v12M7 8l5-5 5 5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 14v4a2 2 0 002 2h12a2 2 0 002-2v-4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
