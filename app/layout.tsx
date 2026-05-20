import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Task Creator",
  description: "Turn vague feature ideas into Jira-ready user stories with diagrams.",
};

// Inlined into <head> so the dark class lands before first paint — avoids the
// white-flash-on-load when the user prefers dark.
const THEME_INIT = `(function(){try{var s=localStorage.getItem('theme');var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="font-sans antialiased text-ink bg-surface-subtle">{children}</body>
    </html>
  );
}
