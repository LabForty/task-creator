"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { runBatchUpload } from "@/lib/upload/orchestrator";
import type { BatchResult, RowState, RowsState, UploadDestination, UploadTask } from "@/lib/upload/types";

type Site = { id: string; name: string; url: string };
type Project = { id: string; key: string; name: string; avatarUrl: string | null };
type IssueType = { id: string; name: string; iconUrl: string | null; description: string | null };

type Phase = "destination" | "running" | "results";

export type UploadSheetProps = {
  tasks: UploadTask[];                                  // pre-filtered (non-Denied, not already uploaded)
  denied: { id: string; title: string }[];              // shown in the results "Excluded" list
  epicTitle: string;             // from liveDraft.title — read-only confirmation for "Create new"
  epicDescriptionHtml: string;   // from liveDraft.description — passed to the new-epic endpoint
  onCancel: () => void;
  onPersistUploaded: (id: string, issueKey: string, issueUrl: string) => void;
};

async function jsonGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin" });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : `Request failed (${res.status})`);
  return j as T;
}

type EpicMode = "new" | "existing";

export function UploadSheet({ tasks, denied, epicTitle, epicDescriptionHtml, onCancel, onPersistUploaded }: UploadSheetProps) {
  const [phase, setPhase] = useState<Phase>("destination");
  const [sites, setSites] = useState<Site[] | null>(null);
  const [sitesErr, setSitesErr] = useState<string | null>(null);
  const [siteId, setSiteId] = useState<string>("");
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectsErr, setProjectsErr] = useState<string | null>(null);
  const [projectKey, setProjectKey] = useState<string>("");
  const [issueTypes, setIssueTypes] = useState<IssueType[] | null>(null);
  const [issueTypesErr, setIssueTypesErr] = useState<string | null>(null);
  const [issueTypeId, setIssueTypeId] = useState<string>("");
  const [epicMode, setEpicMode] = useState<EpicMode>("new");
  const [epics, setEpics] = useState<Array<{ key: string; title: string }> | null>(null);
  const [epicsErr, setEpicsErr] = useState<string | null>(null);
  const [existingEpicKey, setExistingEpicKey] = useState<string>("");

  const [rows, setRows] = useState<RowsState>(() => Object.fromEntries(tasks.map((t) => [t.id, { kind: "pending" } as RowState])));
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load sites once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await jsonGet<{ resources: Site[] }>("/api/jira/resources");
        if (cancelled) return;
        setSites(d.resources);
        if (d.resources.length === 1) setSiteId(d.resources[0].id);
      } catch (e) {
        if (!cancelled) setSitesErr(e instanceof Error ? e.message : "failed to load Jira sites");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Projects on site change.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!siteId) { setProjects(null); return; }
      setProjectKey(""); setIssueTypes(null); setIssueTypeId("");
      try {
        const d = await jsonGet<{ projects: Project[] }>(`/api/jira/projects?cloudId=${encodeURIComponent(siteId)}`);
        if (cancelled) return;
        setProjects(d.projects);
      } catch (e) {
        if (!cancelled) setProjectsErr(e instanceof Error ? e.message : "failed to load projects");
      }
    })();
    return () => { cancelled = true; };
  }, [siteId]);

  // Issue types on project change.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!siteId || !projectKey) { setIssueTypes(null); return; }
      setIssueTypeId("");
      try {
        const d = await jsonGet<{ issueTypes: IssueType[] }>(
          `/api/jira/issue-types?cloudId=${encodeURIComponent(siteId)}&projectKey=${encodeURIComponent(projectKey)}`,
        );
        if (cancelled) return;
        setIssueTypes(d.issueTypes);
        const preferred = d.issueTypes.find((t) => /^(story|task)$/i.test(t.name));
        if (preferred) setIssueTypeId(preferred.id);
        else if (d.issueTypes[0]) setIssueTypeId(d.issueTypes[0].id);
      } catch (e) {
        if (!cancelled) setIssueTypesErr(e instanceof Error ? e.message : "failed to load issue types");
      }
    })();
    return () => { cancelled = true; };
  }, [siteId, projectKey]);

  // Epics on project/mode change. Only fetches when the user has chosen
  // "Attach to an existing epic" so the default-new-epic flow is one network
  // call lighter.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!siteId || !projectKey || epicMode !== "existing") { setEpics(null); return; }
      setExistingEpicKey("");
      setEpicsErr(null);
      try {
        const d = await jsonGet<{ epics: Array<{ key: string; title: string }> }>(
          `/api/jira/epics?cloudId=${encodeURIComponent(siteId)}&projectKey=${encodeURIComponent(projectKey)}`,
        );
        if (cancelled) return;
        setEpics(d.epics);
      } catch (e) {
        if (!cancelled) setEpicsErr(e instanceof Error ? e.message : "failed to load epics");
      }
    })();
    return () => { cancelled = true; };
  }, [siteId, projectKey, epicMode]);

  const canStart = useMemo(
    () =>
      Boolean(siteId && projectKey && issueTypeId) &&
      tasks.length > 0 &&
      (epicMode === "new" ? Boolean(epicTitle.trim()) : Boolean(existingEpicKey)),
    [siteId, projectKey, issueTypeId, tasks.length, epicMode, epicTitle, existingEpicKey],
  );

  async function startUpload() {
    if (!canStart) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setPhase("running");
    const destination: UploadDestination = {
      cloudId: siteId,
      projectKey,
      issueTypeId,
      epic:
        epicMode === "new"
          ? { kind: "new", title: epicTitle, descriptionHtml: epicDescriptionHtml }
          : { kind: "existing", key: existingEpicKey },
    };
    const result = await runBatchUpload({
      tasks,
      destination,
      signal: ac.signal,
      onRow: (id, state) => {
        setRows((prev) => ({ ...prev, [id]: state }));
        if (state.kind === "uploaded") onPersistUploaded(id, state.issueKey, state.issueUrl);
      },
    });
    abortRef.current = null;
    setBatchResult(result);
    setPhase("results");
  }

  function cancelRun() {
    abortRef.current?.abort();
  }

  return (
    <aside className="fixed right-0 top-0 h-screen w-[480px] bg-surface border-l border-rule shadow-lg z-30 flex flex-col">
      <header className="px-6 py-4 border-b border-rule flex items-center gap-3 shrink-0">
        <h2 className="text-hig-title3">Upload to Jira</h2>
        <span className="flex-1" />
        {phase === "destination" && <Button variant="secondary" onClick={onCancel}>Cancel</Button>}
        {phase === "running" && <Button variant="secondary" onClick={cancelRun}>Cancel</Button>}
        {phase === "results" && <Button variant="secondary" onClick={onCancel}>Done</Button>}
      </header>

      {phase === "destination" && (
        <div className="px-6 py-6 flex-1 overflow-auto flex flex-col gap-4">
          <p className="text-hig-body text-ink-secondary">
            {tasks.length} task{tasks.length === 1 ? "" : "s"} will be uploaded.
            {denied.length > 0 && ` ${denied.length} denied task${denied.length === 1 ? "" : "s"} will be excluded.`}
          </p>

          {sitesErr && <p className="text-hig-footnote text-danger">{sitesErr}</p>}
          <label className="flex flex-col gap-1.5">
            <span className="text-hig-subhead font-medium text-ink">Jira site</span>
            <select
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              disabled={!sites}
              className="h-10 px-3 rounded-md bg-surface border border-rule text-hig-body"
            >
              <option value="">{sites ? "Pick a site" : "Loading sites…"}</option>
              {(sites ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>

          {projectsErr && <p className="text-hig-footnote text-danger">{projectsErr}</p>}
          <label className="flex flex-col gap-1.5">
            <span className="text-hig-subhead font-medium text-ink">Project</span>
            <select
              value={projectKey}
              onChange={(e) => setProjectKey(e.target.value)}
              disabled={!projects}
              className="h-10 px-3 rounded-md bg-surface border border-rule text-hig-body"
            >
              <option value="">{projects ? "Pick a project" : (siteId ? "Loading projects…" : "Pick a site first")}</option>
              {(projects ?? []).map((p) => <option key={p.key} value={p.key}>{p.name} ({p.key})</option>)}
            </select>
          </label>

          {issueTypesErr && <p className="text-hig-footnote text-danger">{issueTypesErr}</p>}
          <label className="flex flex-col gap-1.5">
            <span className="text-hig-subhead font-medium text-ink">Issue type</span>
            <select
              value={issueTypeId}
              onChange={(e) => setIssueTypeId(e.target.value)}
              disabled={!issueTypes}
              className="h-10 px-3 rounded-md bg-surface border border-rule text-hig-body"
            >
              <option value="">{issueTypes ? "Pick an issue type" : (projectKey ? "Loading issue types…" : "Pick a project first")}</option>
              {(issueTypes ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-hig-subhead font-medium text-ink">Epic</legend>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="epicMode"
                value="new"
                checked={epicMode === "new"}
                onChange={() => setEpicMode("new")}
                className="mt-1"
              />
              <span className="flex-1">
                <span className="block text-hig-body text-ink">Create a new epic from this batch</span>
                <span className="block text-hig-footnote text-ink-secondary mt-0.5">
                  {epicTitle ? `Title: "${epicTitle}"` : "Will use the kneaded epic title and description."}
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="epicMode"
                value="existing"
                checked={epicMode === "existing"}
                onChange={() => setEpicMode("existing")}
                className="mt-1"
              />
              <span className="flex-1">
                <span className="block text-hig-body text-ink">Attach to an existing epic</span>
                {epicMode === "existing" && (
                  <span className="block mt-1.5">
                    {epicsErr && <span className="text-hig-footnote text-danger">{epicsErr}</span>}
                    <select
                      value={existingEpicKey}
                      onChange={(e) => setExistingEpicKey(e.target.value)}
                      disabled={!epics}
                      className="h-9 px-2 rounded-md bg-surface border border-rule text-hig-body w-full"
                    >
                      <option value="">{epics ? "Pick an epic" : (projectKey ? "Loading epics…" : "Pick a project first")}</option>
                      {(epics ?? []).map((e) => (
                        <option key={e.key} value={e.key}>{e.key} — {e.title}</option>
                      ))}
                    </select>
                  </span>
                )}
              </span>
            </label>
          </fieldset>

          <div className="mt-auto pt-4 border-t border-rule flex justify-end">
            <Button onClick={startUpload} disabled={!canStart}>Start upload</Button>
          </div>
        </div>
      )}

      {phase === "running" && (
        <UploadProgress rows={rows} tasks={tasks} />
      )}

      {phase === "results" && batchResult && (
        <UploadResults rows={rows} tasks={tasks} denied={denied} result={batchResult} onClose={onCancel} onRetry={() => setPhase("destination")} />
      )}
    </aside>
  );
}

function UploadProgress({ rows, tasks }: { rows: RowsState; tasks: UploadTask[] }) {
  return (
    <div className="px-6 py-6 flex-1 overflow-auto flex flex-col gap-2">
      <h3 className="hig-section-label">Uploading</h3>
      <ul className="flex flex-col gap-1.5">
        {tasks.map((t) => {
          const r = rows[t.id] ?? { kind: "pending" };
          return (
            <li key={t.id} className="flex items-center gap-2 text-hig-body">
              <span className="flex-1 truncate">{t.draft.title || "(untitled)"}</span>
              <span className="text-hig-footnote text-ink-secondary">{labelFor(r)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function UploadResults({
  rows, tasks, denied, result, onClose, onRetry,
}: {
  rows: RowsState;
  tasks: UploadTask[];
  denied: { id: string; title: string }[];
  result: BatchResult;
  onClose: () => void;
  onRetry: () => void;
}) {
  const uploaded = tasks.filter((t) => rows[t.id]?.kind === "uploaded").map((t) => ({
    id: t.id, title: t.draft.title || "(untitled)", row: rows[t.id] as Extract<RowState, { kind: "uploaded" }>,
  }));
  const failed = result.failedId ? tasks.find((t) => t.id === result.failedId) : undefined;

  return (
    <div className="px-6 py-6 flex-1 overflow-auto flex flex-col gap-4">
      <h3 className="hig-section-label">Results</h3>
      {uploaded.length > 0 && (
        <div>
          <h4 className="text-hig-subhead font-medium text-ink mb-1">Uploaded ({uploaded.length})</h4>
          <ul className="flex flex-col gap-1">
            {uploaded.map((u) => (
              <li key={u.id} className="text-hig-body">
                <a href={u.row.issueUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  {u.row.issueKey}
                </a>{" "}— {u.title}
              </li>
            ))}
          </ul>
        </div>
      )}
      {failed && (
        <div className="rounded-md bg-danger/5 border border-danger/30 px-3 py-2">
          <h4 className="text-hig-subhead font-medium text-danger mb-1">Failed</h4>
          <p className="text-hig-body">{failed.draft.title || "(untitled)"}</p>
          <p className="text-hig-footnote text-ink-secondary">{result.failedReason}</p>
          <div className="mt-2">
            <Button size="sm" variant="secondary" onClick={onRetry}>Retry from here</Button>
          </div>
        </div>
      )}
      {denied.length > 0 && (
        <div>
          <h4 className="text-hig-subhead font-medium text-ink mb-1">Excluded — denied ({denied.length})</h4>
          <ul className="flex flex-col gap-1">
            {denied.map((d) => (
              <li key={d.id} className="text-hig-body text-ink-secondary">{d.title || "(untitled)"}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-auto pt-4 border-t border-rule flex justify-end">
        <Button onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}

function labelFor(r: RowState): string {
  switch (r.kind) {
    case "pending": return "pending";
    case "finalizing": return "finalizing…";
    case "uploading": return "uploading…";
    case "uploaded": return r.issueKey;
    case "failed": return `failed: ${r.reason}`;
  }
}
