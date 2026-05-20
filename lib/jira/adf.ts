import type { Story, RequirementGroup } from "@/lib/pipeline";

// Atlassian Document Format (ADF) — narrow types covering the nodes we emit.

export type AdfMark = { type: "strong" } | { type: "em" } | { type: "code" };

export type AdfText = { type: "text"; text: string; marks?: AdfMark[] };

export type AdfParagraph = { type: "paragraph"; content: AdfInline[] };
export type AdfHeading = {
  type: "heading";
  attrs: { level: 1 | 2 | 3 | 4 | 5 | 6 };
  content: AdfInline[];
};
export type AdfListItem = { type: "listItem"; content: AdfBlock[] };
export type AdfBulletList = { type: "bulletList"; content: AdfListItem[] };
export type AdfRule = { type: "rule" };

export type AdfInline = AdfText;
export type AdfBlock = AdfParagraph | AdfHeading | AdfBulletList | AdfRule;

export type AdfDoc = { version: 1; type: "doc"; content: AdfBlock[] };

// ---- Inline rendering ------------------------------------------------------

// Minimal **bold** parser. We do NOT support arbitrary nested markdown — the
// renderer never produces it. Anything between matched **…** becomes strong;
// the rest is plain text.
export function inline(text: string): AdfInline[] {
  const out: AdfInline[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) {
      out.push({ type: "text", text: text.slice(lastIdx, m.index) });
    }
    out.push({ type: "text", text: m[1], marks: [{ type: "strong" }] });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) {
    out.push({ type: "text", text: text.slice(lastIdx) });
  }
  return out.length > 0 ? out : [{ type: "text", text }];
}

function para(text: string): AdfParagraph {
  return { type: "paragraph", content: inline(text) };
}

function heading(level: 1 | 2 | 3, text: string): AdfHeading {
  return { type: "heading", attrs: { level }, content: [{ type: "text", text }] };
}

function bullet(items: AdfBlock[][]): AdfBulletList {
  return {
    type: "bulletList",
    content: items.map((blocks) => ({ type: "listItem", content: blocks })),
  };
}

// Split a free-text body into paragraphs on blank lines. Preserves single
// newlines as soft breaks by joining with a space — ADF doesn't have a great
// soft-break node and Jira's editor renders single newlines as continuations.
function paragraphsFrom(body: string): AdfParagraph[] {
  return body
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => para(chunk.replace(/\s*\n\s*/g, " ")));
}

function requirementsBlock(groups: RequirementGroup[]): AdfBulletList {
  return {
    type: "bulletList",
    content: groups.map<AdfListItem>((g) => ({
      type: "listItem",
      content: [
        para(`${g.category.trim()}:`),
        bullet(g.items.map((item) => [para(item.trim())])),
      ],
    })),
  };
}

// ---------------------------------------------------------------------------

export type AdfFromStoryInput = {
  story: Story;
  constraints?: string;
  // When the issue's project exposes a separate Acceptance Criteria custom
  // field, the caller writes AC there and sets this to false to avoid the
  // same items appearing in both places. Defaults to true.
  includeAcceptanceCriteria?: boolean;
};

export function buildIssueDescriptionAdf(input: AdfFromStoryInput): AdfDoc {
  const { story, constraints, includeAcceptanceCriteria = true } = input;
  const content: AdfBlock[] = [];

  // User-story line (the title goes into the Jira summary field separately).
  const us = story.userStory;
  content.push({
    type: "paragraph",
    content: [
      { type: "text", text: "As a ", marks: [{ type: "strong" }] },
      { type: "text", text: us.asA.trim() },
      { type: "text", text: ", I want to ", marks: [{ type: "strong" }] },
      { type: "text", text: us.iWant.trim() },
      { type: "text", text: ", so I can ", marks: [{ type: "strong" }] },
      { type: "text", text: us.soThat.trim() + "." },
    ],
  });

  if (story.scope && story.scope.length > 0) {
    content.push(heading(2, "Scope"));
    content.push(bullet(story.scope.map((s) => [para(s.trim())])));
  }

  if (story.requirements.length > 0) {
    content.push(heading(2, "Requirements"));
    content.push(requirementsBlock(story.requirements));
  }

  if (includeAcceptanceCriteria && story.acceptanceCriteria.length > 0) {
    content.push(heading(2, "Acceptance criteria"));
    content.push(bullet(story.acceptanceCriteria.map((s) => [para(s.trim())])));
  }

  if (story.outOfScope && story.outOfScope.length > 0) {
    content.push(heading(2, "Out of scope"));
    content.push(bullet(story.outOfScope.map((s) => [para(s.trim())])));
  }

  if (constraints && constraints.trim().length > 0) {
    content.push(heading(2, "Notes"));
    for (const p of paragraphsFrom(constraints)) content.push(p);
  }

  return { version: 1, type: "doc", content };
}
