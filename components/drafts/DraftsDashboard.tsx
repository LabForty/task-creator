"use client";

import Link from "next/link";
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
        // Prefer the server's own description (e.g. "storage is not
        // configured") over the generic prompt when one is provided.
        const json = await res.json().catch(() => ({}));
        const serverMessage =
          typeof (json as { error?: unknown })?.error === "string" ? (json as { error: string }).error : "";
        setState({ kind: "error", message: serverMessage || "We couldn't load your drafts." });
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
    // Fetch-on-mount: load() drives the loading→loaded/empty/error states.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // Confirmation lives in DraftCard's popover now. On success, filter the
  // item out locally instead of refetching — a refetch would flash skeletons
  // and cut off the card's exit animation.
  const onDelete = useCallback(async (id: string) => {
    const { url, method } = deleteDraftRequest(id);
    try {
      const res = await fetch(url, { method, credentials: "same-origin" });
      if (!res.ok && res.status !== 404) {
        setState({ kind: "error", message: "We couldn't delete that draft. Please try again." });
        return;
      }
      setState((prev) => {
        if (prev.kind !== "loaded") return prev;
        const items = prev.items.filter((it) => it.id !== id);
        return items.length ? { kind: "loaded", items } : { kind: "empty" };
      });
    } catch {
      setState({ kind: "error", message: "We couldn't delete that draft. Please try again." });
    }
  }, []);

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
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-1.5 rounded-md font-medium h-9 px-3.5 text-hig-subhead bg-surface-muted text-ink border border-rule hover:bg-surface-inset"
        >
          Back to creator
        </Link>
      </header>
      <DraftsView state={state} onDelete={onDelete} onRetry={load} />
    </div>
  );
}
