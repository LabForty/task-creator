"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function readInitial(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem("theme");
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  // Sync once on mount so SSR markup doesn't differ from client.
  useEffect(() => {
    setTheme(readInitial());
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    window.dispatchEvent(new CustomEvent("themechange", { detail: { theme: next } }));
    try {
      window.localStorage.setItem("theme", next);
    } catch {
      // localStorage may be unavailable in private mode; the class still applies.
    }
  }

  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  // Render a stable placeholder pre-mount so the button width doesn't jump.
  const icon = !mounted ? "○" : theme === "dark" ? "☀" : "☾";

  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      className={
        "h-9 w-9 inline-flex items-center justify-center rounded-md " +
        "text-ink-secondary hover:text-ink hover:bg-surface-muted " +
        "border border-rule focus:outline-none focus:ring-2 focus:ring-accent " +
        "transition-colors"
      }
    >
      <span aria-hidden className="text-base leading-none">{icon}</span>
    </button>
  );
}
