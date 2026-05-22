import { JiraError } from "./errors";

const API_ROOT = "https://api.atlassian.com/ex/jira";

type RequestOpts = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  // raw body + content type override (used for multipart uploads)
  rawBody?: BodyInit;
  contentType?: string;
  // Jira requires this header on attachment endpoints.
  noCheck?: boolean;
};

function buildUrl(cloudId: string, path: string, query?: RequestOpts["query"]): string {
  const url = new URL(`${API_ROOT}/${cloudId}${path.startsWith("/") ? path : "/" + path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

export async function jiraFetch<T>(
  accessToken: string,
  cloudId: string,
  path: string,
  opts: RequestOpts = {},
): Promise<T> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${accessToken}`,
    accept: "application/json",
  };
  if (opts.noCheck) headers["x-atlassian-token"] = "no-check";

  let body: BodyInit | undefined;
  if (opts.rawBody !== undefined) {
    body = opts.rawBody;
    if (opts.contentType) headers["content-type"] = opts.contentType;
  } else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers["content-type"] = "application/json";
  }

  const res = await fetch(buildUrl(cloudId, path, opts.query), {
    method: opts.method ?? "GET",
    headers,
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let parsed: unknown = undefined;
    try {
      parsed = JSON.parse(text);
    } catch {
      // not JSON, fine
    }
    throw new JiraError(
      "api_error",
      `Jira API ${opts.method ?? "GET"} ${path} returned ${res.status}: ${text.slice(0, 400)}`,
      res.status,
      parsed,
    );
  }
  if (res.status === 204) return undefined as T;
  // attachment uploads return JSON arrays — same handling either way.
  return (await res.json()) as T;
}

// ---- Typed shapes for the endpoints we use --------------------------------

export type JiraProject = {
  id: string;
  key: string;
  name: string;
  projectTypeKey?: string;
  avatarUrls?: Record<string, string>;
};

export type JiraIssueType = {
  id: string;
  name: string;
  description?: string;
  subtask?: boolean;
  iconUrl?: string;
};

export type CreateIssueResponse = {
  id: string;
  key: string;
  self: string;
};

export type JiraAttachment = {
  id: string;
  filename: string;
  size: number;
  content: string; // URL
};

export async function listProjects(
  accessToken: string,
  cloudId: string,
): Promise<JiraProject[]> {
  // /rest/api/3/project/search is paged; for v1 we grab the first 100 by name.
  type Page = { values: JiraProject[]; isLast: boolean; nextPage?: string };
  const acc: JiraProject[] = [];
  let startAt = 0;
  while (true) {
    const page = await jiraFetch<Page>(accessToken, cloudId, "/rest/api/3/project/search", {
      query: { startAt, maxResults: 100, orderBy: "name" },
    });
    acc.push(...page.values);
    if (page.isLast || page.values.length === 0) break;
    startAt += page.values.length;
    if (acc.length > 500) break; // safety
  }
  return acc;
}

export async function listCreatableIssueTypes(
  accessToken: string,
  cloudId: string,
  projectKey: string,
): Promise<JiraIssueType[]> {
  type Resp = { projects: Array<{ issuetypes: JiraIssueType[] }> };
  const data = await jiraFetch<Resp>(accessToken, cloudId, "/rest/api/3/issue/createmeta", {
    query: { projectKeys: projectKey, expand: "projects.issuetypes" },
  });
  const found = data.projects?.[0]?.issuetypes ?? [];
  // Hide sub-tasks for v1 — they require a parent and complicate the UI.
  return found.filter((t) => !t.subtask);
}

export type JiraFieldMeta = {
  required: boolean;
  name: string;
  schema?: {
    type?: string;
    custom?: string;
    items?: string;
  };
  allowedValues?: Array<{ id?: string; name?: string; value?: string }>;
};

export async function listCreateFields(
  accessToken: string,
  cloudId: string,
  projectKey: string,
  issueTypeId: string,
): Promise<Record<string, JiraFieldMeta>> {
  type Resp = {
    projects: Array<{
      issuetypes: Array<{ id: string; fields: Record<string, JiraFieldMeta> }>;
    }>;
  };
  const data = await jiraFetch<Resp>(accessToken, cloudId, "/rest/api/3/issue/createmeta", {
    query: {
      projectKeys: projectKey,
      issuetypeIds: issueTypeId,
      expand: "projects.issuetypes.fields",
    },
  });
  const issueType = data.projects?.[0]?.issuetypes?.find((t) => t.id === issueTypeId);
  return issueType?.fields ?? {};
}

export async function createIssue(
  accessToken: string,
  cloudId: string,
  fields: Record<string, unknown>,
): Promise<CreateIssueResponse> {
  return jiraFetch<CreateIssueResponse>(accessToken, cloudId, "/rest/api/3/issue", {
    method: "POST",
    body: { fields },
  });
}

export async function searchLabels(
  accessToken: string,
  cloudId: string,
  query: string,
  maxResults = 20,
): Promise<string[]> {
  type Resp = { suggestions: Array<{ label: string }> };
  const data = await jiraFetch<Resp>(accessToken, cloudId, "/rest/api/3/label", {
    query: { query, maxResults },
  });
  return data.suggestions?.map((s) => s.label) ?? [];
}

export async function uploadAttachment(
  accessToken: string,
  cloudId: string,
  issueKey: string,
  filename: string,
  content: string,
): Promise<JiraAttachment[]> {
  // Build a small multipart body manually so we don't pull in form-data.
  const boundary = "----TaskCreatorBoundary" + Math.random().toString(36).slice(2);
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename.replace(/"/g, '\\"')}"\r\n` +
      `Content-Type: text/plain; charset=utf-8\r\n\r\n`,
  );
  const body = enc.encode(content);
  const tail = enc.encode(`\r\n--${boundary}--\r\n`);
  const buf = new Uint8Array(head.length + body.length + tail.length);
  buf.set(head, 0);
  buf.set(body, head.length);
  buf.set(tail, head.length + body.length);

  return jiraFetch<JiraAttachment[]>(
    accessToken,
    cloudId,
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}/attachments`,
    {
      method: "POST",
      rawBody: buf,
      contentType: `multipart/form-data; boundary=${boundary}`,
      noCheck: true,
    },
  );
}
