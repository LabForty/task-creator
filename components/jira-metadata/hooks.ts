"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type FetchState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  retry: () => Promise<void>;
};

const DEFAULT_DEBOUNCE_MS = 250;

type LinkType = { id: string; name: string; inward: string; outward: string };

// Cross-mount cache for link types — small and rarely changes per Jira site.
const linkTypeCache = new Map<string, LinkType[]>();

function useDebouncedFetch<T>(
  url: string | null,
  parse: (raw: unknown) => T,
  debounceMs: number,
): FetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Keep latest parse in a ref so changing it (inline arrows in callers) does
  // not retrigger the fetch effect on every render.
  const parseRef = useRef(parse);
  parseRef.current = parse;

  const run = useCallback(async (target: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(target, {
        credentials: "same-origin",
        signal: ctrl.signal,
      });
      const json = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!res.ok) {
        setError(
          typeof json.error === "string"
            ? json.error
            : `Request failed (${res.status})`,
        );
        setData(null);
      } else {
        setData(parseRef.current(json));
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Network error");
      setData(null);
    } finally {
      if (abortRef.current === ctrl) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!url) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    const id = window.setTimeout(() => {
      void run(url);
    }, debounceMs);
    return () => window.clearTimeout(id);
  }, [url, debounceMs, run]);

  const retry = useCallback(async () => {
    if (url) await run(url);
  }, [url, run]);

  return { data, loading, error, retry };
}

export function useJiraLabels(
  cloudId: string | null,
  q: string,
  opts: { debounceMs?: number } = {},
): FetchState<string[]> {
  const trimmed = q.trim();
  const url =
    cloudId && trimmed.length >= 1
      ? `/api/jira/labels?cloudId=${encodeURIComponent(cloudId)}&q=${encodeURIComponent(trimmed)}`
      : null;
  return useDebouncedFetch<string[]>(
    url,
    (raw) => (raw as { labels?: string[] }).labels ?? [],
    opts.debounceMs ?? DEFAULT_DEBOUNCE_MS,
  );
}

export function useIssueSearch(
  cloudId: string | null,
  projectKey: string | null,
  q: string,
  opts: { debounceMs?: number } = {},
): FetchState<Array<{ key: string; title: string }>> {
  const trimmed = q.trim();
  const url =
    cloudId && trimmed.length >= 2
      ? `/api/jira/issue-search?cloudId=${encodeURIComponent(cloudId)}&q=${encodeURIComponent(trimmed)}${
          projectKey ? `&projectKey=${encodeURIComponent(projectKey)}` : ""
        }`
      : null;
  return useDebouncedFetch<Array<{ key: string; title: string }>>(
    url,
    (raw) =>
      (raw as { issues?: Array<{ key: string; title: string }> }).issues ?? [],
    opts.debounceMs ?? DEFAULT_DEBOUNCE_MS,
  );
}

export function useEpics(
  cloudId: string | null,
  projectKey: string | null,
  q: string = "",
  opts: { debounceMs?: number } = {},
): FetchState<Array<{ key: string; title: string }>> {
  const trimmed = q.trim();
  const url =
    cloudId && projectKey
      ? `/api/jira/epics?cloudId=${encodeURIComponent(cloudId)}&projectKey=${encodeURIComponent(projectKey)}${
          trimmed ? `&q=${encodeURIComponent(trimmed)}` : ""
        }`
      : null;
  return useDebouncedFetch<Array<{ key: string; title: string }>>(
    url,
    (raw) =>
      (raw as { epics?: Array<{ key: string; title: string }> }).epics ?? [],
    opts.debounceMs ?? DEFAULT_DEBOUNCE_MS,
  );
}

export function useLinkTypes(cloudId: string | null): FetchState<LinkType[]> {
  const [data, setData] = useState<LinkType[] | null>(
    cloudId ? (linkTypeCache.get(cloudId) ?? null) : null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (!cloudId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/jira/link-types?cloudId=${encodeURIComponent(cloudId)}`,
        { credentials: "same-origin" },
      );
      const json = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!res.ok) {
        setError(
          typeof json.error === "string"
            ? json.error
            : `Request failed (${res.status})`,
        );
      } else {
        const list: LinkType[] = ((json.linkTypes ?? []) as LinkType[]) || [];
        linkTypeCache.set(cloudId, list);
        setData(list);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [cloudId]);

  useEffect(() => {
    if (!cloudId) {
      setData(null);
      return;
    }
    if (linkTypeCache.has(cloudId)) {
      setData(linkTypeCache.get(cloudId)!);
      return;
    }
    void run();
  }, [cloudId, run]);

  return { data, loading, error, retry: run };
}
