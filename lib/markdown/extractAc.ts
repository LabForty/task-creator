// Pull the "Acceptance criteria" section out of a finalized ticket's
// markdown body. Templates phrase it different ways — sometimes a markdown
// heading (`## Acceptance criteria`), sometimes a bold label
// (`**Acceptance criteria:**`). We handle both, case-insensitively, with
// or without a trailing colon.
//
// The caller uses the extracted section to populate a project-specific
// custom field in Jira, and the residual body (without the AC chunk) as
// the description so the content isn't duplicated.

export type AcExtraction = {
  // Markdown content of the AC section, with the heading stripped. Null
  // when no AC section was found.
  acSection: string | null;
  // The body with the entire AC section (heading + content) removed and
  // surrounding blank-line cruft tidied. Falls back to the input when no
  // AC section was found.
  bodyWithoutAc: string;
};

// Regex matching:
//   - markdown headings `# `..`###### ` "Acceptance criteria"
//   - bold labels `**Acceptance criteria:**` (with or without trailing colon, ascii or unicode dashes)
// Captured groups aren't needed — we only care about the match index +
// length so we can locate the section start.
const AC_LABEL = /\bacceptance\s*criteria\b/i;

type LineKind =
  | { type: "heading"; level: number; text: string }
  | { type: "label"; text: string }
  | { type: "body" };

// Classify a single line so we can find the AC start and the next
// boundary that ends it.
function classify(line: string): LineKind {
  const trimmed = line.trim();
  const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
  if (heading) return { type: "heading", level: heading[1].length, text: heading[2] };
  // Bold-label style: `**Label:**` on a line by itself, optionally followed
  // by content on the same line. The label is the colon-terminated bold span
  // at the start of the line.
  const label = /^\*\*([^*]+?)\*\*\s*:?/.exec(trimmed);
  if (label) return { type: "label", text: label[1] };
  return { type: "body" };
}

export function extractAcceptanceCriteria(markdown: string): AcExtraction {
  const lines = markdown.split("\n");

  // Find the AC heading/label line.
  let startIdx = -1;
  let startKind: LineKind | null = null;
  for (let i = 0; i < lines.length; i++) {
    const k = classify(lines[i]);
    if (k.type === "heading" && AC_LABEL.test(k.text)) {
      startIdx = i;
      startKind = k;
      break;
    }
    if (k.type === "label" && AC_LABEL.test(k.text)) {
      startIdx = i;
      startKind = k;
      break;
    }
  }
  if (startIdx === -1 || !startKind) {
    return { acSection: null, bodyWithoutAc: markdown };
  }

  // Find the end of the section. For a heading-style AC, it ends at the next
  // heading of equal-or-higher precedence (smaller or equal level). For a
  // label-style AC, it ends at the next bold label OR any heading.
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const k = classify(lines[i]);
    if (startKind.type === "heading" && k.type === "heading" && k.level <= startKind.level) {
      endIdx = i;
      break;
    }
    if (startKind.type === "label") {
      if (k.type === "label" || k.type === "heading") {
        endIdx = i;
        break;
      }
    }
  }

  // Extract the section body (skip the heading/label line itself). For
  // label-style headings where content lives on the same line, peel it off.
  const sectionLines: string[] = [];
  if (startKind.type === "label") {
    const head = lines[startIdx];
    const m = /^\*\*[^*]+?\*\*\s*:?\s*(.*)$/.exec(head.trim());
    if (m && m[1].trim().length > 0) sectionLines.push(m[1]);
  }
  for (let i = startIdx + 1; i < endIdx; i++) sectionLines.push(lines[i]);

  const acSection = sectionLines.join("\n").replace(/^\s*\n+|\n+\s*$/g, "");

  // Build the residual body. Drop the [startIdx, endIdx) range and collapse
  // the gap into a single blank line if the original had any blank padding
  // around it.
  const before = lines.slice(0, startIdx).join("\n").replace(/\n+\s*$/, "");
  const after = lines.slice(endIdx).join("\n").replace(/^\s*\n+/, "");
  let bodyWithoutAc: string;
  if (before && after) bodyWithoutAc = `${before}\n\n${after}`;
  else if (before) bodyWithoutAc = before;
  else bodyWithoutAc = after;

  return { acSection: acSection.length > 0 ? acSection : null, bodyWithoutAc };
}
