import { lookup as defaultLookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  getValidSession,
  isJiraError,
  jiraFetch,
  listAccessibleResources,
  type AccessibleResource,
  type JiraSession,
} from "@/lib/jira";
import type { SourceContextItem } from "@/lib/pipeline";

export const MAX_CONTEXT_LINKS = 8;
const MAX_ITEM_CHARS = 6_000;
const MAX_TOTAL_CHARS = 24_000;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;

export type ContextLookupFn = (
  hostname: string,
  options: { all: true },
) => Promise<Array<{ address: string }>>;
type FetchFn = typeof fetch;
type AtlassianAuth = { session: JiraSession; resources: AccessibleResource[] };

export type ResolveSourceContextOptions = {
  fetchImpl?: FetchFn;
  lookup?: ContextLookupFn;
  atlassianAuth?: () => Promise<AtlassianAuth>;
};

type FetchTextResult = {
  url: string;
  contentType: string;
  text: string;
};

const JIRA_KEY_IN_TEXT = /\b[A-Z][A-Z0-9_]+-\d+\b/;

export function normalizeContextLinks(links: readonly string[] | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of links ?? []) {
    if (out.length >= MAX_CONTEXT_LINKS) break;
    if (typeof raw !== "string") continue;
    try {
      const url = new URL(raw.trim());
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      const normalized = url.toString();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      out.push(normalized);
    } catch {
      continue;
    }
  }
  return out;
}

export async function resolveSourceContext(
  links: readonly string[] | undefined,
  opts: ResolveSourceContextOptions = {},
): Promise<SourceContextItem[]> {
  const normalized = normalizeContextLinks(links);
  if (normalized.length === 0) return [];

  let authPromise: Promise<AtlassianAuth> | null = null;
  const getAuth = () => {
    authPromise ??= opts.atlassianAuth
      ? opts.atlassianAuth()
      : (async () => {
          const session = await getValidSession();
          const resources = await listAccessibleResources(session.accessToken);
          return { session, resources };
        })();
    return authPromise;
  };

  const results = await Promise.all(
    normalized.map((url) => resolveOne(url, { ...opts, atlassianAuth: getAuth })),
  );
  return capTotalContent(results);
}

async function resolveOne(
  url: string,
  opts: ResolveSourceContextOptions,
): Promise<SourceContextItem> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return unresolved(url, "web", "Invalid URL.");
  }

  try {
    if (isJiraIssueUrl(parsed)) return await resolveJiraIssue(parsed, opts);
    if (isConfluencePageUrl(parsed)) return await resolveConfluencePage(parsed, opts);
    if (parsed.hostname.toLowerCase() === "github.com") {
      return await resolveGithub(parsed, opts);
    }
    return await resolveWeb(parsed, opts);
  } catch (err) {
    const kind = isJiraIssueUrl(parsed)
      ? "jira"
      : isConfluencePageUrl(parsed)
        ? "confluence"
        : parsed.hostname.toLowerCase() === "github.com"
          ? "github"
          : "web";
    return unresolved(url, kind, errorMessage(err));
  }
}

function unresolved(url: string, kind: SourceContextItem["kind"], error: string): SourceContextItem {
  return { url, kind, status: "unresolved", error };
}

function errorMessage(err: unknown): string {
  if (isJiraError(err)) return err.message;
  return err instanceof Error ? err.message : String(err);
}

function isJiraIssueUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return (host.endsWith(".atlassian.net") || host.includes("jira")) && Boolean(extractJiraKey(url));
}

function isConfluencePageUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return host.endsWith(".atlassian.net") && url.pathname.includes("/wiki/") && Boolean(extractConfluencePageId(url));
}

function extractJiraKey(url: URL): string | null {
  for (const param of ["selectedIssue", "issueKey", "key"]) {
    const value = url.searchParams.get(param);
    const match = value?.match(JIRA_KEY_IN_TEXT);
    if (match) return match[0];
  }
  const pathMatch = decodeURIComponent(url.pathname).match(JIRA_KEY_IN_TEXT);
  return pathMatch?.[0] ?? null;
}

function extractConfluencePageId(url: URL): string | null {
  const pageId = url.searchParams.get("pageId");
  if (pageId && /^\d+$/.test(pageId)) return pageId;
  const match = url.pathname.match(/\/pages\/(\d+)(?:\/|$)/);
  return match?.[1] ?? null;
}

async function findAtlassianResource(url: URL, opts: ResolveSourceContextOptions): Promise<AtlassianAuth & { cloudId: string }> {
  const getAuth = opts.atlassianAuth;
  if (!getAuth) throw new Error("Atlassian session is not available.");
  const auth = await getAuth();
  const host = url.hostname.toLowerCase();
  const resource = auth.resources.find((r) => {
    try {
      return new URL(r.url).hostname.toLowerCase() === host;
    } catch {
      return false;
    }
  });
  if (!resource) {
    throw new Error(`No connected Atlassian site matches ${host}.`);
  }
  return { ...auth, cloudId: resource.id };
}

type JiraIssueResponse = {
  key: string;
  fields?: {
    summary?: string;
    description?: unknown;
    status?: { name?: string };
    issuetype?: { name?: string };
    priority?: { name?: string };
    labels?: string[];
    components?: Array<{ name?: string }>;
    fixVersions?: Array<{ name?: string }>;
    assignee?: { displayName?: string };
    reporter?: { displayName?: string };
  };
};

async function resolveJiraIssue(url: URL, opts: ResolveSourceContextOptions): Promise<SourceContextItem> {
  const key = extractJiraKey(url);
  if (!key) return unresolved(url.toString(), "jira", "No Jira issue key found in URL.");
  const { session, cloudId } = await findAtlassianResource(url, opts);
  const issue = await jiraFetch<JiraIssueResponse>(
    session.accessToken,
    cloudId,
    `/rest/api/3/issue/${encodeURIComponent(key)}`,
    {
      query: {
        fields: [
          "summary",
          "description",
          "status",
          "issuetype",
          "priority",
          "labels",
          "components",
          "fixVersions",
          "assignee",
          "reporter",
        ].join(","),
      },
    },
  );
  const fields = issue.fields ?? {};
  const lines = [
    `Key: ${issue.key}`,
    fields.summary ? `Summary: ${fields.summary}` : "",
    fields.issuetype?.name ? `Type: ${fields.issuetype.name}` : "",
    fields.status?.name ? `Status: ${fields.status.name}` : "",
    fields.priority?.name ? `Priority: ${fields.priority.name}` : "",
    fields.assignee?.displayName ? `Assignee: ${fields.assignee.displayName}` : "",
    fields.reporter?.displayName ? `Reporter: ${fields.reporter.displayName}` : "",
    fields.labels?.length ? `Labels: ${fields.labels.join(", ")}` : "",
    fields.components?.length ? `Components: ${fields.components.map((c) => c.name).filter(Boolean).join(", ")}` : "",
    fields.fixVersions?.length ? `Fix versions: ${fields.fixVersions.map((v) => v.name).filter(Boolean).join(", ")}` : "",
    adfToText(fields.description) ? `Description:\n${adfToText(fields.description)}` : "",
  ].filter(Boolean);
  return {
    url: url.toString(),
    kind: "jira",
    status: "resolved",
    title: `${issue.key}${fields.summary ? ` ${fields.summary}` : ""}`,
    content: truncate(lines.join("\n"), MAX_ITEM_CHARS),
  };
}

type ConfluencePageResponse = {
  id: string;
  title?: string;
  space?: { name?: string; key?: string };
  version?: { number?: number };
  body?: { storage?: { value?: string } };
};

async function confluenceFetch<T>(
  accessToken: string,
  cloudId: string,
  path: string,
  query?: Record<string, string>,
): Promise<T> {
  const url = new URL(`https://api.atlassian.com/ex/confluence/${cloudId}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Confluence API returned ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

async function resolveConfluencePage(url: URL, opts: ResolveSourceContextOptions): Promise<SourceContextItem> {
  const pageId = extractConfluencePageId(url);
  if (!pageId) return unresolved(url.toString(), "confluence", "No Confluence page id found in URL.");
  const { session, cloudId } = await findAtlassianResource(url, opts);
  const page = await confluenceFetch<ConfluencePageResponse>(
    session.accessToken,
    cloudId,
    `/wiki/rest/api/content/${encodeURIComponent(pageId)}`,
    { expand: "body.storage,version,space" },
  );
  const body = htmlToText(page.body?.storage?.value ?? "");
  const lines = [
    `Title: ${page.title ?? page.id}`,
    page.space?.name ? `Space: ${page.space.name}${page.space.key ? ` (${page.space.key})` : ""}` : "",
    page.version?.number ? `Version: ${page.version.number}` : "",
    body ? `Body:\n${body}` : "",
  ].filter(Boolean);
  return {
    url: url.toString(),
    kind: "confluence",
    status: "resolved",
    title: page.title ?? page.id,
    content: truncate(lines.join("\n"), MAX_ITEM_CHARS),
  };
}

async function resolveGithub(url: URL, opts: ResolveSourceContextOptions): Promise<SourceContextItem> {
  const candidates = githubRawCandidates(url);
  for (const candidate of candidates) {
    try {
      const fetched = await fetchPublicText(candidate.rawUrl, opts);
      return {
        url: url.toString(),
        kind: "github",
        status: "resolved",
        title: candidate.title,
        content: truncate(fetched.text, MAX_ITEM_CHARS),
      };
    } catch {
      // Try the next README branch/path, then fall back to the public page.
    }
  }
  const web = await resolveWeb(url, opts);
  return { ...web, kind: "github" };
}

function githubRawCandidates(url: URL): Array<{ rawUrl: string; title: string }> {
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return [];
  const [owner, repo] = parts;
  if (parts[2] === "blob" && parts.length >= 5) {
    const branch = parts[3];
    const filePath = parts.slice(4).join("/");
    return [{
      rawUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`,
      title: `GitHub file ${owner}/${repo}/${filePath}`,
    }];
  }
  if (parts.length === 2) {
    return ["main", "master"].map((branch) => ({
      rawUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/README.md`,
      title: `GitHub README ${owner}/${repo}`,
    }));
  }
  return [];
}

async function resolveWeb(url: URL, opts: ResolveSourceContextOptions): Promise<SourceContextItem> {
  const fetched = await fetchPublicText(url.toString(), opts);
  const isHtml = fetched.contentType.includes("text/html") || /<html[\s>]/i.test(fetched.text);
  const title = isHtml ? htmlTitle(fetched.text) : undefined;
  const meta = isHtml ? htmlMetaDescription(fetched.text) : "";
  const body = isHtml ? htmlToText(fetched.text) : plainText(fetched.text);
  const content = [meta, body].filter(Boolean).join("\n\n");
  return {
    url: fetched.url,
    kind: "web",
    status: "resolved",
    title: title || new URL(fetched.url).hostname,
    content: truncate(content, MAX_ITEM_CHARS),
  };
}

async function fetchPublicText(rawUrl: string, opts: ResolveSourceContextOptions): Promise<FetchTextResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  let current = rawUrl;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const lookupFn: ContextLookupFn =
      opts.lookup ?? ((hostname, options) => defaultLookup(hostname, options));
    await assertPublicHttpUrl(current, lookupFn);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetchImpl(current, {
        headers: {
          accept: "text/html,text/plain,application/json,application/xml;q=0.9,*/*;q=0.1",
          "user-agent": "TaskCreatorContextResolver/1.0",
        },
        redirect: "manual",
        signal: ac.signal,
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) throw new Error(`Redirect from ${current} did not include a location.`);
        current = new URL(location, current).toString();
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} while reading ${current}.`);
      const contentType = res.headers.get("content-type")?.toLowerCase() ?? "";
      if (
        contentType &&
        !contentType.includes("text/") &&
        !contentType.includes("json") &&
        !contentType.includes("xml")
      ) {
        throw new Error(`Unsupported content type ${contentType}.`);
      }
      return {
        url: current,
        contentType,
        text: await res.text(),
      };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Too many redirects while reading ${rawUrl}.`);
}

async function assertPublicHttpUrl(rawUrl: string, lookup: ContextLookupFn): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs can be attached.");
  }
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "0.0.0.0"
  ) {
    throw new Error("Private or local network URLs cannot be fetched.");
  }
  const directIp = isIP(host);
  if (directIp && isPrivateIp(host)) {
    throw new Error("Private or local network URLs cannot be fetched.");
  }
  if (!directIp) {
    const records = await lookup(host, { all: true });
    if (records.some((record) => isPrivateIp(record.address))) {
      throw new Error("Private or local network URLs cannot be fetched.");
    }
  }
}

function isPrivateIp(address: string): boolean {
  const mapped = address.toLowerCase().startsWith("::ffff:")
    ? address.slice("::ffff:".length)
    : address;
  const version = isIP(mapped);
  if (version === 4) {
    const [a, b, c] = mapped.split(".").map((part) => Number.parseInt(part, 10));
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 192 && b === 0 && c === 0)
    );
  }
  if (version === 6) {
    const lower = mapped.toLowerCase();
    return (
      lower === "::" ||
      lower === "::1" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe80:")
    );
  }
  return true;
}

function capTotalContent(items: SourceContextItem[]): SourceContextItem[] {
  let remaining = MAX_TOTAL_CHARS;
  return items.map((item) => {
    if (!item.content) return item;
    if (remaining <= 0) {
      return { ...item, content: undefined, error: "Content omitted after total context limit." };
    }
    const content = truncate(item.content, Math.min(MAX_ITEM_CHARS, remaining));
    remaining -= content.length;
    return { ...item, content };
  });
}

function truncate(text: string, max: number): string {
  const normalized = plainText(text);
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 20)).trimEnd()}\n[truncated]`;
}

function plainText(text: string): string {
  return text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function htmlTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = match ? htmlToText(match[1]) : "";
  return title || undefined;
}

function htmlMetaDescription(html: string): string {
  const match = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*>/i);
  return match ? decodeEntities(match[1]).trim() : "";
}

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|section|article|header|footer|li|h[1-6]|tr|blockquote)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s+/g, "\n"),
  ).replace(/\n{3,}/g, "\n\n").trim();
}

function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    nbsp: " ",
  };
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_m, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower[0] === "#") {
      const radix = lower[1] === "x" ? 16 : 10;
      const value = Number.parseInt(lower.slice(radix === 16 ? 2 : 1), radix);
      return Number.isFinite(value) ? String.fromCodePoint(value) : "";
    }
    return named[lower] ?? "";
  });
}

function adfToText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const obj = node as { type?: string; text?: string; content?: unknown[] };
  if (obj.type === "text") return obj.text ?? "";
  const children = Array.isArray(obj.content) ? obj.content.map(adfToText).filter(Boolean) : [];
  const joined = children.join("");
  if (["paragraph", "heading", "listItem"].includes(obj.type ?? "")) return `${joined}\n`;
  if (["bulletList", "orderedList"].includes(obj.type ?? "")) return `${joined}\n`;
  return joined;
}
