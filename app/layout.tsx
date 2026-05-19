import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Task Creator",
  description: "Turn vague feature ideas into Jira-ready user stories with diagrams.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased text-black bg-surface">{children}</body>
    </html>
  );
}
