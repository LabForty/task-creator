"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { SuccessFlourish } from "@/components/ui/SuccessFlourish";
import { celebrate } from "@/lib/motion";
import { JiraMetadata } from "@/components/jira-metadata/JiraMetadata";
import { useSpotlight } from "@/lib/interaction/useSpotlight";
import { EMPTY_METADATA, type JiraMetadata as JiraMetadataValue } from "@/lib/jira/metadata";
import { uploadDraftAttachment } from "@/lib/jira/upload-client";
import type { Diagrams, FinalizedPayload, MermaidFormat } from "@/lib/jobs/types";

type Site = { id: string; name: string; url: string };
type Project = { id: string; key: string; name: string; avatarUrl: string | null };
type IssueType = { id: string; name: string; iconUrl: string | null; description: string | null };

type ExportResult = {
  key: string;
  url: string;
  attachments: Partial<Record<MermaidFormat, "ok" | "failed">>;
  attachmentErrors: Partial<Record<MermaidFormat, string>>;
  autoFilledFields?: string[];
  missingRequiredFields?: string[];
  linkResults?: { ok: string[]; failed: Array<{ key: string; error: string }> };
  flagCommentResult?: "ok" | "skipped" | "failed";
  flagCommentError?: string;
  epicCreated?: { key: string };
};

type Props = {
  payload: FinalizedPayload;
  diagrams?: Diagrams;
  onCancel: () => void;
  onDone: () => void;
};

async function jsonGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : `Request failed (${res.status})`);
  return json as T;
}

export function JiraExport({ payload, diagrams, onCancel, onDone }: Props) {
  const [sites, setSites] = useState<Site[] | null>(null);
  const [sitesErr, setSitesErr] = useState<string | null>(null);

  const [siteId, setSiteId] = useState<string | "">("");
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsErr, setProjectsErr] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState("");
  const [projectKey, setProjectKey] = useState<string | "">("");

  const [issueTypes, setIssueTypes] = useState<IssueType[] | null>(null);
  const [issueTypesLoading, setIssueTypesLoading] = useState(false);
  const [issueTypesErr, setIssueTypesErr] = useState<string | null>(null);
  const [issueTypeId, setIssueTypeId] = useState<string | "">("");

  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);

  const [metadata, setMetadata] = useState<JiraMetadataValue>(EMPTY_METADATA);
  const [attachmentResults, setAttachmentResults] = useState<Array<{
    name: string; status: "uploading" | "ok" | "failed"; error?: string; pct?: number;
  }>>([]);

  // Spotlight refs for the glass panels. Hooks run unconditionally; each ref is
  // attached to its panel in whichever return branch renders (success vs form).
  const successRef = useSpotlight<HTMLDivElement>();
  const formRef = useSpotlight<HTMLDivElement>();
  const previewRef = useSpotlight<HTMLDivElement>();

  // Load sites once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await jsonGet<{ resources: Site[] }>("/api/jira/resources");
        if (cancelled) return;
        setSites(data.resources);
        if (data.resources.length === 1) setSiteId(data.resources[0].id);
      } catch (e) {
        if (!cancelled) setSitesErr(e instanceof Error ? e.message : "failed to load Jira sites");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Load projects when site changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!siteId) {
        setProjects(null);
        return;
      }
      setProjectsLoading(true);
      setProjectsErr(null);
      setProjectKey("");
      setIssueTypes(null);
      setIssueTypeId("");
      try {
        const data = await jsonGet<{ projects: Project[] }>(
          `/api/jira/projects?cloudId=${encodeURIComponent(siteId)}`,
        );
        if (cancelled) return;
        setProjects(data.projects);
      } catch (e) {
        if (!cancelled) setProjectsErr(e instanceof Error ? e.message : "failed to load projects");
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [siteId]);

  // Load issue types when project changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!siteId || !projectKey) {
        setIssueTypes(null);
        return;
      }
      setIssueTypesLoading(true);
      setIssueTypesErr(null);
      setIssueTypeId("");
      try {
        const data = await jsonGet<{ issueTypes: IssueType[] }>(
          `/api/jira/issue-types?cloudId=${encodeURIComponent(siteId)}&projectKey=${encodeURIComponent(projectKey)}`,
        );
        if (cancelled) return;
        setIssueTypes(data.issueTypes);
        const preferred = data.issueTypes.find((t) => /^(story|task)$/i.test(t.name));
        if (preferred) setIssueTypeId(preferred.id);
        else if (data.issueTypes[0]) setIssueTypeId(data.issueTypes[0].id);
      } catch (e) {
        if (!cancelled) setIssueTypesErr(e instanceof Error ? e.message : "failed to load issue types");
      } finally {
        if (!cancelled) setIssueTypesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [siteId, projectKey]);

  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    const q = projectFilter.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) => p.name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q),
    );
  }, [projects, projectFilter]);

  const presentDiagrams = useMemo(() => {
    const acc: MermaidFormat[] = [];
    (["flow", "sequence", "interaction"] as MermaidFormat[]).forEach((f) => {
      if (diagrams?.[f]?.trim()) acc.push(f);
    });
    return acc;
  }, [diagrams]);

  const canSubmit = !!siteId && !!projectKey && !!issueTypeId && !exporting && !result;

  async function submit() {
    if (!canSubmit) return;
    setExporting(true);
    setExportErr(null);
    try {
      const res = await fetch("/api/jira/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          cloudId: siteId,
          projectKey,
          issueTypeId,
          payload: { story: payload.story, markdown: payload.markdown, constraints: undefined },
          diagrams: diagrams && Object.fromEntries(Object.entries(diagrams).filter(([, v]) => v && v.trim())),
          metadata: {
            labels: metadata.labels.length ? metadata.labels : undefined,
            linkedIssues: metadata.linkedIssues.length
              ? metadata.linkedIssues.map((l) => ({ key: l.key, linkTypeId: l.linkTypeId }))
              : undefined,
            flagged: metadata.flagged || undefined,
            flagReason: metadata.flagged ? metadata.flagReason : undefined,
            epic: metadata.epic,
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setExportErr(typeof json.error === "string" ? json.error : `Export failed (${res.status})`);
        return;
      }
      const r = json as ExportResult;
      setResult(r);

      if (metadata.attachments.length > 0 && r.key) {
        const issueKey = r.key;
        const initial = metadata.attachments.map((a) => ({
          name: a.file.name,
          status: "uploading" as const,
          pct: 0,
        }));
        setAttachmentResults(initial);
        await Promise.all(metadata.attachments.map(async (a, idx) => {
          try {
            await uploadDraftAttachment({
              cloudId: siteId!,
              issueKey,
              file: a.file,
              onProgress: (pct) =>
                setAttachmentResults((cur) => cur.map((row, i) => i === idx ? { ...row, pct } : row)),
            });
            setAttachmentResults((cur) =>
              cur.map((row, i) => i === idx ? { ...row, status: "ok", pct: 100 } : row),
            );
          } catch (e) {
            setAttachmentResults((cur) => cur.map((row, i) =>
              i === idx ? { ...row, status: "failed", error: e instanceof Error ? e.message : "upload failed" } : row,
            ));
          }
        }));
      }
    } catch (e) {
      setExportErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setExporting(false);
    }
  }

  // Success view ------------------------------------------------------------
  if (result) {
    const failedFormats = (Object.keys(result.attachments) as MermaidFormat[]).filter(
      (f) => result.attachments[f] === "failed",
    );
    return (
      <section className="flex flex-col h-full min-h-0 overflow-hidden">
        <header className="px-6 py-4 border-b border-rule flex items-center gap-3 shrink-0">
          <h2 className="text-hig-title3">Exported to Jira</h2>
          <span className="flex-1" />
          <Button variant="secondary" onClick={onDone}>Done</Button>
        </header>
        <div className="px-6 py-6 flex-1 overflow-auto">
          <div ref={successRef} className="hig-glass-strong spotlight relative p-6 max-w-2xl flex flex-col gap-4">
            {/* Soft one-shot flourish — decorative, behind the confirmation
                content. Keyed on the issue key so it plays once per export
                success, alongside the celebrate beat on the confirmation. */}
            <SuccessFlourish key={result.key} />
            <motion.p
              variants={celebrate}
              initial="hidden"
              animate="visible"
              className="relative text-hig-body"
            >
              Created issue <strong className="font-semibold">{result.key}</strong>.
            </motion.p>
            <a href={result.url} target="_blank" rel="noreferrer" className="group text-accent hover:underline">
              Open in Jira <span className="inline-block icon-hover-nudge">→</span>
            </a>
            {presentDiagrams.length > 0 && (
              <div className="rounded-md bg-surface-muted p-3">
                <p className="text-hig-footnote text-ink-secondary mb-1">Attachments</p>
                <ul className="text-hig-footnote">
                  {presentDiagrams.map((f) => (
                    <li key={f}>
                      <code>{f}.mmd</code> —{" "}
                      {result.attachments[f] === "ok" ? (
                        <span className="text-ink">uploaded</span>
                      ) : (
                        <span className="text-danger-strong">failed{result.attachmentErrors[f] ? `: ${result.attachmentErrors[f]}` : ""}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {failedFormats.length > 0 && (
              <p className="text-hig-footnote text-ink-secondary">
                The issue was created but some attachments did not upload.
              </p>
            )}
            {result.autoFilledFields && result.autoFilledFields.length > 0 && (
              <div className="rounded-md bg-surface-muted p-3">
                <p className="text-hig-footnote text-ink-secondary mb-1">Auto-filled required fields</p>
                <ul className="text-hig-footnote">
                  {result.autoFilledFields.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
            {attachmentResults.length > 0 && (
              <div className="rounded-md bg-surface-muted p-3">
                <p className="text-hig-footnote text-ink-secondary mb-1">Draft attachments</p>
                <ul className="text-hig-footnote">
                  {attachmentResults.map((r) => (
                    <li key={r.name}>
                      <code>{r.name}</code> —{" "}
                      {r.status === "uploading"
                        ? `uploading${typeof r.pct === "number" ? ` (${r.pct}%)` : "…"}`
                        : r.status === "ok"
                        ? <span className="text-ink">uploaded</span>
                        : <span className="text-danger-strong">failed{r.error ? `: ${r.error}` : ""}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.linkResults && (result.linkResults.ok.length > 0 || result.linkResults.failed.length > 0) && (
              <div className="rounded-md bg-surface-muted p-3">
                <p className="text-hig-footnote text-ink-secondary mb-1">Linked issues</p>
                <ul className="text-hig-footnote">
                  {result.linkResults.ok.map((k) => (
                    <li key={k} className="text-ink">{k} linked</li>
                  ))}
                  {result.linkResults.failed.map((f) => (
                    <li key={f.key} className="text-danger-strong">{f.key}: {f.error}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.flagCommentResult === "failed" && (
              <p className="text-hig-footnote text-danger-strong">Flag comment failed: {result.flagCommentError ?? "unknown"}</p>
            )}
            {result.epicCreated && (
              <p className="text-hig-footnote text-ink-secondary">Epic created: <code>{result.epicCreated.key}</code></p>
            )}
          </div>
        </div>
      </section>
    );
  }

  // Form view ---------------------------------------------------------------
  return (
    <section className="flex flex-col h-full min-h-0 overflow-hidden">
      <header className="px-6 py-4 border-b border-rule flex items-center gap-3 shrink-0">
        <h2 className="text-hig-title3">Export to Jira</h2>
        <span className="flex-1" />
        <Button variant="ghost" onClick={onCancel} disabled={exporting}>Cancel</Button>
        <Button variant="prominent" onClick={submit} disabled={!canSubmit}>
          {exporting ? "Creating…" : "Create issue"}
        </Button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 px-6 py-4 flex-1 min-h-0 overflow-hidden">
        {/* LEFT: form */}
        <div ref={formRef} className="hig-glass-strong spotlight p-5 flex flex-col gap-4 min-h-0 overflow-auto">
          {sitesErr && (
            <Alert>{sitesErr}</Alert>
          )}

          {sites && sites.length === 0 && !sitesErr && (
            <p className="text-hig-footnote text-ink-secondary">No Jira sites granted write access.</p>
          )}

          {sites && sites.length > 1 && (
            <label className="flex flex-col gap-1.5">
              <span className="text-hig-subhead font-medium text-ink">Site</span>
              <select
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                className="h-10 px-3 rounded-md bg-surface border border-rule text-hig-body focus:outline-none focus:border-accent focus:shadow-focus"
              >
                <option value="">Pick a site…</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
          )}

          {siteId && (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-hig-subhead font-medium text-ink">Project</span>
                <input
                  type="text"
                  value={projectFilter}
                  onChange={(e) => setProjectFilter(e.target.value)}
                  placeholder={projectsLoading ? "Loading projects…" : "Filter projects…"}
                  className="h-10 px-3 rounded-md bg-surface border border-rule text-hig-body focus:outline-none focus:border-accent focus:shadow-focus"
                  disabled={projectsLoading}
                />
                {projectsErr && (
                  <span className="text-hig-footnote text-danger-strong">{projectsErr}</span>
                )}
                {projects && filteredProjects.length > 0 && (
                  <div className="max-h-64 overflow-auto rounded-md border border-rule divide-y divide-rule">
                    {filteredProjects.map((p) => (
                      <button
                        type="button"
                        key={p.key}
                        onClick={() => setProjectKey(p.key)}
                        className={
                          "w-full text-left px-3 py-2 text-hig-subhead flex items-center gap-2 transition-colors " +
                          (projectKey === p.key
                            ? "bg-accent-tint text-accent"
                            : "hover:bg-surface-muted")
                        }
                      >
                        <span className="font-mono text-hig-footnote opacity-70">{p.key}</span>
                        <span className="truncate">{p.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                {projects && filteredProjects.length === 0 && !projectsLoading && (
                  <span className="text-hig-footnote text-ink-secondary">No projects match.</span>
                )}
              </label>

              {projectKey && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-hig-subhead font-medium text-ink">Issue type</span>
                  {issueTypesErr && (
                    <span className="text-hig-footnote text-danger-strong">{issueTypesErr}</span>
                  )}
                  {issueTypesLoading && (
                    <span className="text-hig-footnote text-ink-secondary">Loading issue types…</span>
                  )}
                  {issueTypes && (
                    <select
                      value={issueTypeId}
                      onChange={(e) => setIssueTypeId(e.target.value)}
                      className="h-10 px-3 rounded-md bg-surface border border-rule text-hig-body focus:outline-none focus:border-accent focus:shadow-focus"
                    >
                      <option value="">Pick an issue type…</option>
                      {issueTypes.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  )}
                </label>
              )}
            </>
          )}

          {exportErr && (
            <Alert className="break-words">{exportErr}</Alert>
          )}

          <JiraMetadata
            cloudId={siteId || null}
            projectKey={projectKey || null}
            issueTypeId={issueTypeId || null}
            value={metadata}
            onChange={setMetadata}
            disabled={exporting || !!result}
          />
        </div>

        {/* RIGHT: preview of what Jira will receive */}
        <div ref={previewRef} className="hig-glass-strong spotlight p-5 flex flex-col gap-3 min-h-0 overflow-hidden">
          <header className="shrink-0">
            <span className="hig-section-label">Preview</span>
            <h3 className="text-hig-title3 truncate">{payload.story.title}</h3>
          </header>
          <div className="flex-1 min-h-0 overflow-auto rounded-md bg-surface-muted p-4">
            <pre className="text-hig-footnote font-sans whitespace-pre-wrap leading-relaxed">{payload.markdown}</pre>
          </div>
          {presentDiagrams.length > 0 && (
            <div className="shrink-0 rounded-md bg-surface-muted p-3">
              <p className="text-hig-footnote text-ink-secondary mb-1">Attachments</p>
              <ul className="text-hig-footnote">
                {presentDiagrams.map((f) => (
                  <li key={f}><code>{f}.mmd</code></li>
                ))}
              </ul>
            </div>
          )}
          {(metadata.labels.length > 0 ||
            metadata.linkedIssues.length > 0 ||
            metadata.attachments.length > 0 ||
            metadata.flagged ||
            metadata.epic) && (
            <div className="shrink-0 rounded-md bg-surface-muted p-3 flex flex-col gap-1">
              <p className="text-hig-footnote text-ink-secondary mb-1">Metadata</p>
              {metadata.labels.length > 0 && (
                <p className="text-hig-footnote"><strong>Labels:</strong> {metadata.labels.join(", ")}</p>
              )}
              {metadata.linkedIssues.length > 0 && (
                <p className="text-hig-footnote"><strong>Linked:</strong> {metadata.linkedIssues.map((l) => l.key).join(", ")}</p>
              )}
              {metadata.attachments.length > 0 && (
                <p className="text-hig-footnote"><strong>Attachments:</strong> {metadata.attachments.map((a) => a.file.name).join(", ")}</p>
              )}
              {metadata.flagged && (
                <p className="text-hig-footnote"><strong>Flag:</strong> {metadata.flagReason}</p>
              )}
              {metadata.epic && (
                <p className="text-hig-footnote"><strong>Epic:</strong> {
                  metadata.epic.kind === "existing" ? metadata.epic.key : `New: ${metadata.epic.title}`
                }</p>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
