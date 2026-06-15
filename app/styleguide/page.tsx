"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { TextField, TextArea } from "@/components/ui/TextField";
import { ThemeToggle } from "@/components/ThemeToggle";

const COLORS = [
  "bg-accent", "bg-accent-tint", "bg-danger", "bg-warning", "bg-success",
  "bg-surface", "bg-surface-muted", "bg-surface-subtle", "bg-surface-inset",
  "bg-ink", "bg-ink-secondary", "bg-ink-tertiary",
];
const TYPE = [
  "hig-caption", "hig-footnote", "hig-subhead", "hig-body", "hig-headline",
  "hig-title3", "hig-title2", "hig-title1", "hig-large",
];
const VARIANTS = ["primary", "secondary", "ghost", "danger", "success", "warning"] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-hig-title2">{title}</h2>
      {children}
    </section>
  );
}

export default function StyleguidePage() {
  return (
    <main className="min-h-screen bg-surface-subtle px-8 py-10">
      <div className="mx-auto flex max-w-4xl flex-col gap-12">
        <header className="flex items-center justify-between">
          <div>
            <SectionLabel>Reference</SectionLabel>
            <h1 className="text-hig-large text-ink">Design System</h1>
          </div>
          <ThemeToggle />
        </header>

        <Section title="Typography">
          <Card className="flex flex-col gap-2 p-6">
            {TYPE.map((t) => (
              <p key={t} className={`text-${t}`}>{t} — The quick brown fox</p>
            ))}
          </Card>
        </Section>

        <Section title="Colour tokens">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {COLORS.map((c) => (
              <div key={c} className="flex flex-col gap-1.5">
                <div className={`h-12 rounded-md border border-rule ${c}`} />
                <span className="text-hig-caption text-ink-secondary">{c}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Surfaces">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="p-5"><p className="text-hig-subhead">solid</p></Card>
            <Card tone="glass" className="p-5"><p className="text-hig-subhead">glass</p></Card>
            <Card tone="glass-strong" className="p-5"><p className="text-hig-subhead">glass-strong</p></Card>
          </div>
        </Section>

        <Section title="Buttons">
          <Card className="flex flex-wrap gap-3 p-6">
            {VARIANTS.map((v) => (
              <Button key={v} variant={v}>{v}</Button>
            ))}
          </Card>
        </Section>

        <Section title="Form inputs">
          <Card className="flex flex-col gap-4 p-6">
            <TextField label="Title" placeholder="Add a payments dashboard" />
            <TextField label="Title (error)" error="Title is required" />
            <TextArea label="Description" placeholder="Describe the change…" />
          </Card>
        </Section>

        <Section title="Error states">
          <div className="flex flex-col gap-3">
            <Alert>Something went wrong while saving.</Alert>
            <Alert tone="warning">This draft has unsaved changes.</Alert>
            <Alert tone="success">Exported to Jira.</Alert>
            <Alert tone="accent">Auto-saved a moment ago.</Alert>
          </div>
        </Section>
      </div>
    </main>
  );
}
