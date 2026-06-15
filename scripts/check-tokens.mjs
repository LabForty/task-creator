// Token-conformance scanner for AI-51. Flags raw colour/type values that
// should be expressed as design tokens or utilities. Layout dimensions
// (widths/heights/insets) and line-heights are intentionally NOT flagged —
// they are defensible per the design spec. Lines may opt out with a trailing
// `// design-tokens-allow: <reason>` comment.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ALLOW_MARKER = "design-tokens-allow";
const SCAN_DIRS = ["app", "components", "lib"];
const SCAN_EXT = new Set([".ts", ".tsx"]);

// Layout-ish arbitrary utilities that are allowed (dimensions, position, lines).
const LAYOUT_PREFIX = /^(w|h|min-w|max-w|min-h|max-h|size|top|bottom|left|right|inset|gap|translate-x|translate-y|leading|basis)-\[/;

const RULES = [
  // bg-[#fff], text-[#abc], border-[rgba(...)], shadow-[0_1px_2px_rgba(...)], …
  // The colour value may sit ANYWHERE inside the bracket (e.g. an arbitrary
  // box-shadow whose colour follows offsets), so match a hex digit, rgb/rgba,
  // or hsl/hsla anywhere within. Requiring a hex DIGIT after `#` avoids false
  // positives like `bg-[url(#gradient)]`.
  { rule: "arbitrary-color", re: /\b(?:bg|text|border|fill|stroke|shadow|ring|from|to|via|outline|decoration|caret)-\[[^\]]*(?:#[0-9a-fA-F]|rgb|hsl)[^\]]*\]/g },
  // text-[12px], text-[1.1rem], text-[.5rem] — arbitrary font sizes that should map to the hig ramp
  { rule: "arbitrary-text-size", re: /\btext-\[\.?\d[^\]]*\]/g },
  // rounded-[7px] — arbitrary radius
  { rule: "arbitrary-radius", re: /\brounded-(?:[a-z]+-)?\[[^\]]*\]/g },
  // bare hex literals: #abc, #aabbcc, #aabbccdd (3/6/8 digits)
  { rule: "raw-hex", re: /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g },
];

export function findViolations(file, content) {
  const out = [];
  const lines = content.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (line.includes(ALLOW_MARKER)) return;
    // Track character spans already claimed by a more specific rule so a bare
    // hex inside an arbitrary-colour utility (e.g. bg-[#ff0000]) is reported
    // once, not twice.
    const claimed = [];
    for (const { rule, re } of RULES) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line)) !== null) {
        // Skip layout arbitraries that happen to look like a match boundary.
        if (LAYOUT_PREFIX.test(m[0])) continue;
        const start = m.index;
        const end = m.index + m[0].length;
        // Skip a match wholly contained within an already-reported span.
        if (claimed.some((c) => start >= c.start && end <= c.end)) continue;
        claimed.push({ start, end });
        out.push({ file, line: i + 1, rule, match: m[0] });
      }
    }
  });
  return out;
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(p, acc);
    } else if (SCAN_EXT.has(extname(p))) {
      acc.push(p);
    }
  }
  return acc;
}

// CLI: scan repo, print violations, exit 1 if any.
function main() {
  const files = SCAN_DIRS.flatMap((d) => {
    try { return walk(d); } catch { return []; }
  });
  let total = 0;
  for (const f of files) {
    const v = findViolations(f, readFileSync(f, "utf8"));
    for (const x of v) {
      total++;
      console.log(`${x.file}:${x.line}  [${x.rule}]  ${x.match}`);
    }
  }
  if (total > 0) {
    console.error(`\n✗ ${total} token violation(s). Replace with design tokens, or mark intentional brand/decorative values with "// ${ALLOW_MARKER}: <reason>".`);
    process.exit(1);
  }
  console.log("✓ No token violations.");
}

// Run main only when invoked directly (not when imported by tests).
// fileURLToPath handles Windows path/URL differences so the CLI runs via
// `node scripts/check-tokens.mjs` but stays dormant when vitest imports it.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
