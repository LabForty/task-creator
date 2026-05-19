import { getJob } from "@/lib/jobs";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; artifact: string }> },
) {
  const { id, artifact } = await params;
  const job = getJob(id);
  if (!job?.result) {
    return new Response("not found", { status: 404 });
  }
  const { requirement, story, markdown } = job.result;
  const slug = (title: string) =>
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "untitled";

  if (artifact === "requirement") {
    return new Response(JSON.stringify(requirement, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="requirement-${slug(requirement.title)}.json"`,
      },
    });
  }

  if (artifact === "story") {
    return new Response(JSON.stringify(story, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="story-${slug(story.title)}.json"`,
      },
    });
  }

  if (artifact === "markdown") {
    return new Response(markdown, {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="finalized.md"`,
      },
    });
  }

  return new Response("not found", { status: 404 });
}
