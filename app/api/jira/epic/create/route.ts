import { NextResponse } from "next/server";
import { z } from "zod";
import { createIssue, getValidSession, isJiraError, listCreatableIssueTypes } from "@/lib/jira";
import { markdownToAdf } from "@/lib/markdown/toAdf";

export const runtime = "nodejs";

const BodySchema = z.object({
  cloudId: z.string().min(1),
  projectKey: z.string().min(1),
  title: z.string().trim().min(1).max(250),
  descriptionHtml: z.string().optional(),
  descriptionMarkdown: z.string().optional(),
});

function htmlToMarkdown(html: string | undefined): string {
  if (!html) return "Created from task creator.";
  const text = html
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, "\n\n")
    .replace(/<br\s*\/?>(\s|\n)*/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length > 0 ? text : "Created from task creator.";
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const session = await getValidSession();
    const types = await listCreatableIssueTypes(session.accessToken, parsed.data.cloudId, parsed.data.projectKey);
    const epicType = types.find((t) => /^epic$/i.test(t.name));
    if (!epicType) {
      return NextResponse.json(
        { error: "No Epic issuetype is creatable in this project." },
        { status: 422 },
      );
    }
    const md = parsed.data.descriptionMarkdown ?? htmlToMarkdown(parsed.data.descriptionHtml);
    const created = await createIssue(session.accessToken, parsed.data.cloudId, {
      summary: parsed.data.title.slice(0, 250),
      project: { key: parsed.data.projectKey },
      issuetype: { id: epicType.id },
      description: markdownToAdf(md),
    });
    // Build a browse URL. The existing exportToJira already does this via the
    // session's `url` field on Site. We mirror that pattern minimally here.
    const site = (await fetch(`https://api.atlassian.com/oauth/token/accessible-resources`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    }).then((r) => r.json())) as Array<{ id: string; url: string }>;
    const matched = Array.isArray(site) ? site.find((s) => s.id === parsed.data.cloudId) : undefined;
    const url = matched ? `${matched.url}/browse/${created.key}` : `https://${parsed.data.cloudId}.atlassian.net/browse/${created.key}`;
    return NextResponse.json({ key: created.key, url });
  } catch (err) {
    if (isJiraError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 },
    );
  }
}
