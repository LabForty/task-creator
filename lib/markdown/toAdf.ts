import { marked, type Tokens } from "marked";
import type {
  AdfBlock,
  AdfBulletList,
  AdfDoc,
  AdfHeading,
  AdfInline,
  AdfListItem,
  AdfMark,
  AdfParagraph,
} from "@/lib/jira/adf";

// A pragmatic markdown → ADF converter. Handles the subset our finalize
// output actually emits: headings, paragraphs, bullet/ordered lists, fenced
// code blocks (including ```mermaid which Confluence + the Mermaid macro
// renders inline), blockquotes, inline bold/italic/code, links, horizontal
// rules. Falls back to plain text for anything more exotic so we never
// silently drop content.

type AdfOrderedList = {
  type: "orderedList";
  attrs?: { order?: number };
  content: AdfListItem[];
};

type AdfCodeBlock = {
  type: "codeBlock";
  attrs?: { language?: string };
  content?: { type: "text"; text: string }[];
};

type AdfBlockExt = AdfBlock | AdfCodeBlock | AdfOrderedList;

function textNode(text: string): { type: "text"; text: string } {
  return { type: "text", text };
}

function mark(type: "strong" | "em" | "code"): AdfMark;
function mark(type: "link", attrs: { href: string }): AdfMark;
function mark(type: "strong" | "em" | "code" | "link", attrs?: { href: string }): AdfMark {
  if (type === "link" && attrs) return { type: "link", attrs };
  return { type } as AdfMark;
}

// Walk an inline-token tree to ADF inline nodes. marked emits a flat array of
// tokens for inline contexts (text, strong, em, codespan, link, br, etc.).
function inlinesFromTokens(tokens: Tokens.Generic[] | undefined): AdfInline[] {
  const out: AdfInline[] = [];
  if (!tokens) return out;

  for (const tok of tokens) {
    switch (tok.type) {
      case "text": {
        // text tokens can contain nested tokens for things like raw entities.
        const t = tok as Tokens.Text;
        if (t.tokens && t.tokens.length > 0) {
          out.push(...inlinesFromTokens(t.tokens));
        } else {
          out.push(textNode(t.text));
        }
        break;
      }
      case "strong": {
        const t = tok as Tokens.Strong;
        for (const child of inlinesFromTokens(t.tokens)) {
          out.push(applyMark(child, mark("strong")));
        }
        break;
      }
      case "em": {
        const t = tok as Tokens.Em;
        for (const child of inlinesFromTokens(t.tokens)) {
          out.push(applyMark(child, mark("em")));
        }
        break;
      }
      case "codespan": {
        const t = tok as Tokens.Codespan;
        out.push({ ...textNode(t.text), marks: [mark("code")] });
        break;
      }
      case "del": {
        const t = tok as Tokens.Del;
        // ADF has no 'strike' in our narrow type — fall back to strong so the
        // emphasis is preserved.
        for (const child of inlinesFromTokens(t.tokens)) {
          out.push(applyMark(child, mark("strong")));
        }
        break;
      }
      case "link": {
        const t = tok as Tokens.Link;
        const linkMark = mark("link", { href: t.href });
        for (const child of inlinesFromTokens(t.tokens)) {
          out.push(applyMark(child, linkMark));
        }
        break;
      }
      case "br": {
        // ADF doesn't have a great hard-break node; insert a space so the
        // text doesn't run together visually.
        out.push(textNode(" "));
        break;
      }
      case "escape": {
        const t = tok as Tokens.Escape;
        out.push(textNode(t.text));
        break;
      }
      case "html": {
        // Strip raw HTML — render as text so nothing is lost silently.
        const t = tok as Tokens.HTML;
        out.push(textNode(t.text));
        break;
      }
      default: {
        // Fallback: any unknown inline token contributes its raw text.
        const raw = (tok as { raw?: string }).raw;
        if (typeof raw === "string" && raw.length > 0) out.push(textNode(raw));
      }
    }
  }
  return out;
}

function applyMark(node: AdfInline, m: AdfMark): AdfInline {
  // ADF text nodes carry a marks[] array. Mutate immutably.
  const marks = node.marks ? [...node.marks, m] : [m];
  return { ...node, marks };
}

function paragraph(inlines: AdfInline[]): AdfParagraph {
  return { type: "paragraph", content: inlines.length > 0 ? inlines : [textNode("")] };
}

function heading(level: 1 | 2 | 3 | 4 | 5 | 6, inlines: AdfInline[]): AdfHeading {
  return { type: "heading", attrs: { level }, content: inlines };
}

function bulletList(items: AdfListItem[]): AdfBulletList {
  return { type: "bulletList", content: items };
}

function orderedList(items: AdfListItem[], start?: number): AdfOrderedList {
  return { type: "orderedList", attrs: start && start !== 1 ? { order: start } : undefined, content: items };
}

function codeBlock(text: string, language?: string): AdfCodeBlock {
  return {
    type: "codeBlock",
    attrs: language ? { language } : undefined,
    content: text.length > 0 ? [textNode(text)] : undefined,
  };
}

function blocksFromList(list: Tokens.List): AdfBulletList | AdfOrderedList {
  const items: AdfListItem[] = list.items.map((item) => {
    const inner: AdfBlockExt[] = [];
    // Each list item is a block sequence — paragraphs, nested lists, etc.
    if (item.tokens && item.tokens.length > 0) {
      inner.push(...blocksFromTokens(item.tokens));
    } else {
      inner.push(paragraph([textNode(item.text)]));
    }
    return { type: "listItem", content: inner as AdfBlock[] };
  });
  if (list.ordered) return orderedList(items, list.start === "" ? 1 : list.start);
  return bulletList(items);
}

function blocksFromTokens(tokens: Tokens.Generic[]): AdfBlockExt[] {
  const out: AdfBlockExt[] = [];
  for (const tok of tokens) {
    switch (tok.type) {
      case "space":
        break;
      case "heading": {
        const t = tok as Tokens.Heading;
        const level = Math.max(1, Math.min(6, t.depth)) as 1 | 2 | 3 | 4 | 5 | 6;
        out.push(heading(level, inlinesFromTokens(t.tokens)));
        break;
      }
      case "paragraph": {
        const t = tok as Tokens.Paragraph;
        out.push(paragraph(inlinesFromTokens(t.tokens)));
        break;
      }
      case "blockquote": {
        const t = tok as Tokens.Blockquote;
        // ADF supports 'blockquote' as a wrapper of block content.
        const inner = blocksFromTokens(t.tokens ?? []) as AdfBlock[];
        out.push({
          type: "blockquote",
          content: inner.length > 0 ? inner : [paragraph([textNode("")])],
        } as unknown as AdfBlock);
        break;
      }
      case "list":
        out.push(blocksFromList(tok as Tokens.List));
        break;
      case "code": {
        const t = tok as Tokens.Code;
        out.push(codeBlock(t.text, t.lang || undefined));
        break;
      }
      case "hr":
        out.push({ type: "rule" });
        break;
      case "text": {
        // Standalone text outside a paragraph — wrap it.
        const t = tok as Tokens.Text;
        out.push(paragraph(inlinesFromTokens(t.tokens ?? [{ type: "text", raw: t.text, text: t.text }])));
        break;
      }
      case "html": {
        // Render raw HTML as a paragraph so it isn't silently dropped.
        const t = tok as Tokens.HTML;
        out.push(paragraph([textNode(t.text)]));
        break;
      }
      default: {
        const raw = (tok as { raw?: string }).raw;
        if (typeof raw === "string" && raw.trim().length > 0) {
          out.push(paragraph([textNode(raw)]));
        }
      }
    }
  }
  return out;
}

export function markdownToAdf(md: string): AdfDoc {
  const tokens = marked.lexer(md ?? "");
  const blocks = blocksFromTokens(tokens) as AdfBlock[];
  return {
    version: 1,
    type: "doc",
    content: blocks.length > 0 ? blocks : [paragraph([textNode("")])],
  };
}
