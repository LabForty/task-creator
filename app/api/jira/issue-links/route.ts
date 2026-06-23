import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ISSUE_KEY_REGEX,
  createIssueLink,
  getValidSession,
  isJiraError,
} from "@/lib/jira";

export const runtime = "nodejs";

const IssueLinkSchema = z.object({
  linkTypeId: z.string().min(1),
  outwardIssueKey: z.string().regex(ISSUE_KEY_REGEX),
  inwardIssueKey: z.string().regex(ISSUE_KEY_REGEX),
});

const IssueLinksBodySchema = z.object({
  cloudId: z.string().min(1),
  links: z.array(IssueLinkSchema).min(1).max(100),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = IssueLinksBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const session = await getValidSession();
    const results = await Promise.all(
      parsed.data.links.map(async (link) => {
        try {
          await createIssueLink(session.accessToken, parsed.data.cloudId, {
            type: { id: link.linkTypeId },
            outwardIssue: { key: link.outwardIssueKey },
            inwardIssue: { key: link.inwardIssueKey },
          });
          return { ok: true as const, link };
        } catch (err) {
          return {
            ok: false as const,
            link,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );

    const ok: Array<{ outwardIssueKey: string; inwardIssueKey: string }> = [];
    const failed: Array<{ outwardIssueKey: string; inwardIssueKey: string; error: string }> = [];
    for (const result of results) {
      if (result.ok) {
        ok.push({
          outwardIssueKey: result.link.outwardIssueKey,
          inwardIssueKey: result.link.inwardIssueKey,
        });
      } else {
        failed.push({
          outwardIssueKey: result.link.outwardIssueKey,
          inwardIssueKey: result.link.inwardIssueKey,
          error: result.error,
        });
      }
    }

    return NextResponse.json({ results: { ok, failed } });
  } catch (err) {
    if (isJiraError(err)) {
      return NextResponse.json(
        { error: err.message, code: err.code, details: err.details ?? null },
        { status: err.status },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 },
    );
  }
}
