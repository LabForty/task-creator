import type { Story } from "@/lib/pipeline";
import { markdownToAdf } from "@/lib/markdown/toAdf";

// Atlassian Document Format (ADF) — narrow types covering the nodes we emit.

export type AdfMark =
  | { type: "strong" }
  | { type: "em" }
  | { type: "code" }
  | { type: "link"; attrs: { href: string } };

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

// Kept for back-compat with existing callers that emit ADF nodes by hand.
// Minimal **bold** parser. We do NOT support arbitrary nested markdown —
// anything between matched **…** becomes strong; the rest is plain text.
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

// ---------------------------------------------------------------------------

export type AdfFromStoryInput = {
  story: Story;
  // Constraints used to be echoed in the description — with the new
  // template-driven pipeline, constraints feed the planner directly and
  // already appear in the rendered markdown. Kept here for callers but
  // unused.
  constraints?: string;
  // Retained for back-compat but ignored: the markdown is the source of
  // truth now, including (or not) AC sections per the template.
  includeAcceptanceCriteria?: boolean;
};

// Build the Jira issue description body from the rendered story markdown.
// We delegate to markdownToAdf so the body keeps headings, lists, fenced
// code blocks (mermaid included), bold/italic/inline-code/links.
export function buildIssueDescriptionAdf(input: AdfFromStoryInput): AdfDoc {
  return markdownToAdf(input.story.markdown);
}
