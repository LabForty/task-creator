import type { Config } from "tailwindcss";

const config: Config = {
  // Theme is flipped via `class="dark"` on <html>. See ThemeToggle + globals.css.
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      // HIG SF font stack. SF Pro Text for body, SF Pro Display picks up at 20px+.
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Text"',
          '"SF Pro Display"',
          '"Segoe UI"',
          "system-ui",
          "sans-serif",
        ],
        mono: [
          '"SF Mono"',
          "ui-monospace",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      // HIG type ramp (iOS/macOS). Bigger headings, comfortable body.
      fontSize: {
        "hig-caption": ["12px", { lineHeight: "16px", letterSpacing: "0px" }],
        "hig-footnote": ["13px", { lineHeight: "18px", letterSpacing: "-0.08px" }],
        "hig-subhead": ["15px", { lineHeight: "20px", letterSpacing: "-0.24px" }],
        "hig-body": ["17px", { lineHeight: "22px", letterSpacing: "-0.41px" }],
        "hig-headline": ["17px", { lineHeight: "22px", letterSpacing: "-0.41px", fontWeight: "600" }],
        "hig-title3": ["20px", { lineHeight: "24px", letterSpacing: "0.38px", fontWeight: "600" }],
        "hig-title2": ["22px", { lineHeight: "28px", letterSpacing: "0.35px", fontWeight: "600" }],
        "hig-title1": ["28px", { lineHeight: "34px", letterSpacing: "0.36px", fontWeight: "600" }],
        "hig-large": ["34px", { lineHeight: "41px", letterSpacing: "0.37px", fontWeight: "700" }],
      },
      // Tokens read from CSS variables defined in globals.css. The same class
      // (e.g. `bg-surface`) renders different values in light vs. dark mode.
      colors: {
        accent: {
          DEFAULT: "var(--color-accent)",
          hover: "var(--color-accent-hover)",
          link: "var(--color-accent-link)",
          pressed: "var(--color-accent-pressed)",
          strong: "var(--color-accent-strong)",
          tint: "var(--color-accent-tint)",
        },
        danger: {
          DEFAULT: "var(--color-danger)",
          strong: "var(--color-danger-strong)",
          tint: "var(--color-danger-tint)",
        },
        warning: {
          DEFAULT: "var(--color-warning)",
          tint: "var(--color-warning-tint)",
        },
        success: {
          DEFAULT: "var(--color-success)",
          tint: "var(--color-success-tint)",
        },
        surface: {
          DEFAULT: "var(--color-surface)",
          muted: "var(--color-surface-muted)",
          subtle: "var(--color-surface-subtle)",
          inset: "var(--color-surface-inset)",
        },
        ink: {
          DEFAULT: "var(--color-ink)",
          secondary: "var(--color-ink-secondary)",
          tertiary: "var(--color-ink-tertiary)",
          quaternary: "var(--color-ink-quaternary)",
        },
        rule: {
          DEFAULT: "var(--color-rule)",
          strong: "var(--color-rule-strong)",
        },
      },
      borderRadius: {
        sm: "6px",
        DEFAULT: "10px",
        md: "10px",
        lg: "14px",
        xl: "22px",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        elevated: "var(--shadow-elevated)",
        focus: "var(--shadow-focus)",
      },
      transitionTimingFunction: {
        hig: "cubic-bezier(0.25, 0.1, 0.25, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
