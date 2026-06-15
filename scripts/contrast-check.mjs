// WCAG contrast audit for the design tokens. Computes contrast for the active
// foreground/background token pairs in light and dark, flagging anything below
// AA (4.5 normal / 3.0 large+UI). Token values mirror app/globals.css.
// Importable (helpers + tables exported, no side effects); run directly for the
// CLI report: `node scripts/contrast-check.mjs`.
import { fileURLToPath } from "node:url";

export function lum(hex) {
  const m = hex.replace("#", "");
  const n = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
export function ratio(fg, bg) {
  const a = lum(fg), b = lum(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

export const LIGHT = {
  surface: "#ffffff", "surface-subtle": "#fafafc", "surface-muted": "#f5f5f7",
  ink: "#1d1d1f", "ink-secondary": "#6e6e73", "ink-tertiary": "#76767b",
  accent: "#007aff", "accent-strong": "#0064d6", "accent-link": "#0064d6",
  danger: "#ff3b30", "danger-strong": "#d70015", white: "#ffffff",
};
export const DARK = {
  surface: "#1c1c1e", "surface-subtle": "#0a0a0c", "surface-muted": "#2c2c2e",
  ink: "#f5f5f7", "ink-secondary": "#aeaeb2", "ink-tertiary": "#8e8e93",
  accent: "#0a84ff", "accent-strong": "#0a72ec", "accent-link": "#0a84ff",
  danger: "#ff453a", "danger-strong": "#ff453a", white: "#ffffff",
};

// [fg, bg, minRatio, label]. Active pairs after the strong/link token split:
// `accent-strong` = button fill (white label); `accent-link` = accent-as-text.
export const PAIRS = [
  ["ink", "surface", 4.5, "body text on card"],
  ["ink", "surface-subtle", 4.5, "body text on app bg"],
  ["ink-secondary", "surface", 4.5, "secondary text on card"],
  ["ink-tertiary", "surface", 4.5, "tertiary/eyebrow label on card"],
  ["white", "accent-strong", 4.5, "button label on accent-strong fill"],
  ["accent-link", "surface", 4.5, "accent link/ghost text on card"],
  ["danger-strong", "surface", 4.5, "error text on card"],
];

export function report() {
  for (const [name, theme] of [["LIGHT", LIGHT], ["DARK", DARK]]) {
    console.log(`\n=== ${name} ===`);
    for (const [fg, bg, min, label] of PAIRS) {
      const r = ratio(theme[fg], theme[bg]);
      const passAA = r >= min;
      const passLarge = r >= 3.0;
      const status = passAA ? "PASS AA" : passLarge ? "fails AA (passes large/UI 3.0)" : "FAIL";
      console.log(
        `${r.toFixed(2).padStart(5)}  ${passAA ? "✓" : "✗"}  ${fg} on ${bg}  (need ${min})  — ${label} [${status}]`,
      );
    }
  }
}

// Only run the report when invoked directly, not when imported by a test.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  report();
}
