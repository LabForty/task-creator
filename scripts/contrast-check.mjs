// One-off WCAG contrast audit for the design tokens (AI-51 task 2 — "verify
// contrast ratios"). Computes contrast for the key foreground/background token
// pairs in light and dark, flagging anything below AA (4.5 normal / 3.0 large+UI).
// Token values mirror app/globals.css :root and html.dark.

function lum(hex) {
  const m = hex.replace("#", "");
  const n = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function ratio(fg, bg) {
  const a = lum(fg), b = lum(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

const LIGHT = {
  surface: "#ffffff", "surface-subtle": "#fafafc", "surface-muted": "#f5f5f7",
  ink: "#1d1d1f", "ink-secondary": "#6e6e73", "ink-tertiary": "#86868b",
  accent: "#007aff", danger: "#ff3b30", white: "#ffffff",
};
const DARK = {
  surface: "#1c1c1e", "surface-subtle": "#0a0a0c", "surface-muted": "#2c2c2e",
  ink: "#f5f5f7", "ink-secondary": "#aeaeb2", "ink-tertiary": "#8e8e93",
  accent: "#0a84ff", danger: "#ff453a", white: "#ffffff",
};

// [fg, bg, minRatio, label]. 4.5 = normal text; 3.0 = large text (>=18.66px bold /
// 24px) and UI/graphical elements.
const PAIRS = [
  ["ink", "surface", 4.5, "body text on card"],
  ["ink", "surface-subtle", 4.5, "body text on app bg"],
  ["ink-secondary", "surface", 4.5, "secondary text on card"],
  ["ink-tertiary", "surface", 4.5, "tertiary/eyebrow label on card"],
  ["white", "accent", 4.5, "button label on accent"],
  ["accent", "surface", 4.5, "accent link/ghost text on card"],
  ["danger", "surface", 4.5, "error text on card"],
];

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
