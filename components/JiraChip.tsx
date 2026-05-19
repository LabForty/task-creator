"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

export function openJiraConnectPopup() {
  if (typeof window === "undefined") return;
  const w = 600;
  const h = 760;
  const left = Math.max(0, window.screenX + Math.floor((window.outerWidth - w) / 2));
  const top = Math.max(0, window.screenY + Math.floor((window.outerHeight - h) / 2));
  window.open(
    "/api/jira/connect?popup=1",
    "jira-oauth",
    `popup=1,width=${w},height=${h},left=${left},top=${top}`,
  );
}

export type JiraSessionInfo =
  | { configured: false; connected: false }
  | { configured: true; connected: false }
  | { configured: true; connected: true; email: string | null; accountId: string };

type Props = {
  session: JiraSessionInfo | null;
  onSessionChange: (next: JiraSessionInfo) => void;
};

export function JiraChip({ session, onSessionChange }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  if (!session) {
    return (
      <span className="text-hig-footnote text-ink-tertiary">Jira…</span>
    );
  }

  if (!session.configured) {
    return (
      <span
        title="Set JIRA_CLIENT_ID, JIRA_CLIENT_SECRET, JIRA_COOKIE_SECRET in env to enable."
        className="text-hig-footnote text-ink-tertiary"
      >
        Jira not configured
      </span>
    );
  }

  if (!session.connected) {
    return (
      <Button
        variant="secondary"
        size="sm"
        onClick={() => openJiraConnectPopup()}
      >
        Connect to Jira
      </Button>
    );
  }

  async function disconnect() {
    setMenuOpen(false);
    try {
      await fetch("/api/jira/disconnect", { method: "POST", credentials: "same-origin" });
    } catch {
      /* ignore */
    }
    onSessionChange({ configured: true, connected: false });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-hig-footnote bg-surface-muted border border-rule text-ink hover:bg-surface-inset transition-colors"
      >
        <span className="h-2 w-2 rounded-full bg-accent" aria-hidden />
        <span className="truncate max-w-[12rem]">{session.email ?? "Connected to Jira"}</span>
        <span aria-hidden>▾</span>
      </button>
      {menuOpen && (
        <div className="absolute right-0 mt-1 z-20 min-w-[10rem] rounded-md bg-surface border border-rule shadow-lg overflow-hidden">
          <button
            type="button"
            onClick={disconnect}
            className="w-full text-left px-3 py-2 text-hig-footnote hover:bg-surface-muted"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
