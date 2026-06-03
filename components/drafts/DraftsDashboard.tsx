"use client";

import { useCallback, useEffect, useState } from "react";
import { DraftsView, type DraftsState } from "./DraftsView";
import { deleteDraftRequest } from "@/lib/drafts/client";

export function DraftsDashboard() {
  const [state, setState] = useState<DraftsState>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/drafts", { credentials: "same-origin" });
      if (res.status === 401) {
        window.location.href = `/signin?return=${encodeURIComponent("/drafts")}`;
        return;
      }
      if (!res.ok) {
        setState({ kind: "error", message: "We couldn't load your drafts." });
        return;
      }
      const json = await res.json();
      const items = Array.isArray(json?.drafts) ? json.drafts : [];
      setState(items.length ? { kind: "loaded", items } : { kind: "empty" });
    } catch {
      setState({ kind: "error", message: "We couldn't load your drafts. Please check your connection." });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onDelete = useCallback(
    async (id: string) => {
      if (!window.confirm("Delete this draft? This can't be undone.")) return;
      const { url, method } = deleteDraftRequest(id);
      try {
        const res = await fetch(url, { method, credentials: "same-origin" });
        if (!res.ok && res.status !== 404) {
          setState({ kind: "error", message: "We couldn't delete that draft. Please try again." });
          return;
        }
        await load();
      } catch {
        setState({ kind: "error", message: "We couldn't delete that draft. Please try again." });
      }
    },
    [load],
  );

  return (
    <div className="max-w-3xl w-full mx-auto px-6 py-8 flex flex-col gap-5">
      <header className="flex items-center gap-4">
        <div className="flex flex-col">
          <h1 className="text-hig-title2 leading-tight">Your drafts</h1>
          <p className="text-hig-footnote text-ink-secondary mt-0.5">
            Pick up where you left off, or start something new.
          </p>
        </div>
        <span className="flex-1" />
        <a
          href="/"
          className="inline-flex items-center justify-center gap-1.5 rounded-md font-medium h-9 px-3.5 text-hig-subhead bg-surface-muted text-ink border border-rule hover:bg-surface-inset"
        >
          Back to creator
        </a>
      </header>
      <DraftsView state={state} onDelete={onDelete} onRetry={load} />
    </div>
  );
}
