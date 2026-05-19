import type { Config } from "tailwindcss";

const config: Config = {
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
      colors: {
        // SF system colors (light mode). systemBlue is the iOS/macOS accent.
        accent: {
          DEFAULT: "#007aff",
          hover: "#0064d6",
          pressed: "#0050a8",
          tint: "#e9f1ff",
        },
        danger: {
          DEFAULT: "#ff3b30",
          tint: "#ffe7e6",
        },
        warning: {
          DEFAULT: "#ff9500",
          tint: "#fff3df",
        },
        success: {
          DEFAULT: "#34c759",
          tint: "#e2f7e8",
        },
        // HIG background hierarchy + content neutrals
        surface: {
          DEFAULT: "#ffffff",
          muted: "#f5f5f7",
          subtle: "#fafafc",
          inset: "#eeeef1",
        },
        ink: {
          DEFAULT: "#1d1d1f",
          secondary: "#6e6e73",
          tertiary: "#86868b",
          quaternary: "#c7c7cc",
        },
        rule: {
          DEFAULT: "rgba(0,0,0,0.1)",
          strong: "rgba(0,0,0,0.18)",
        },
      },
      // HIG radii: 6 (small), 10 (medium controls), 14 (cards), 22 (sheets)
      borderRadius: {
        sm: "6px",
        DEFAULT: "10px",
        md: "10px",
        lg: "14px",
        xl: "22px",
      },
      boxShadow: {
        // Depth layers per HIG (cards, popovers, sheets)
        card: "0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06)",
        elevated: "0 2px 4px rgba(0,0,0,0.04), 0 12px 28px rgba(0,0,0,0.10)",
        focus: "0 0 0 3px rgba(0,122,255,0.30)",
      },
      transitionTimingFunction: {
        // HIG default ease
        hig: "cubic-bezier(0.25, 0.1, 0.25, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
