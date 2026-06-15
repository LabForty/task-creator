"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { TextField, TextArea } from "@/components/ui/TextField";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AmbientBackground } from "@/components/AmbientBackground";
import { Skeleton } from "@/components/ui/Skeleton";
import { Typewriter } from "@/components/ui/Typewriter";
import { GhostDiagram } from "@/components/ui/GhostDiagram";
import { SuccessFlourish } from "@/components/ui/SuccessFlourish";
import { useSpotlight } from "@/lib/interaction/useSpotlight";

const COLORS = [
  "bg-accent", "bg-accent-strong", "bg-accent-link", "bg-accent-tint",
  "bg-danger", "bg-danger-strong", "bg-warning", "bg-success",
  "bg-surface", "bg-surface-muted", "bg-surface-subtle", "bg-surface-inset",
  "bg-ink", "bg-ink-secondary", "bg-ink-tertiary",
];
// Full literal class names so Tailwind's content scanner generates each one
// (an interpolated `text-${t}` would never appear as a literal and some ramp
// steps — e.g. text-hig-title1 — are used nowhere else, so wouldn't be built).
const TYPE = [
  "text-hig-caption", "text-hig-footnote", "text-hig-subhead", "text-hig-body", "text-hig-headline",
  "text-hig-title3", "text-hig-title2", "text-hig-title1", "text-hig-large",
];
const VARIANTS = ["primary", "secondary", "ghost", "danger", "success", "warning", "prominent"] as const;
const TYPEWRITER_PHRASES = [
  "Export users as CSV",
  "Add a payments dashboard",
  "Rate-limit the public API",
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-hig-title2">{title}</h2>
      {children}
    </section>
  );
}

export default function StyleguidePage() {
  const spotlightRef = useSpotlight<HTMLDivElement>();
  // Re-mount SuccessFlourish on each click so its one-shot animation replays.
  const [flourishKey, setFlourishKey] = useState(0);
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
              <p key={t} className={t}>{t.replace("text-", "")} — The quick brown fox</p>
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

        <Section title="Depth">
          <div className="relative h-40 overflow-hidden rounded-xl border border-rule">
            <AmbientBackground />
            <Card tone="glass-strong" className="absolute inset-6 flex items-center justify-center p-5">
              <p className="text-hig-subhead">glass-strong over AmbientBackground</p>
            </Card>
          </div>
        </Section>

        <Section title="Loading (shimmer)">
          <Card className="flex flex-col gap-2.5 p-6">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </Card>
        </Section>

        <Section title="Interaction primitives">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card ref={spotlightRef} className="spotlight flex flex-col gap-2 p-6">
              <p className="text-hig-subhead text-ink">Spotlight (useSpotlight)</p>
              <p className="text-hig-footnote text-ink-secondary">
                Hover this card — an accent glow follows the cursor.
              </p>
            </Card>

            <Card className="flex flex-col gap-2 p-6">
              <p className="text-hig-subhead text-ink">Typewriter</p>
              <Typewriter
                phrases={TYPEWRITER_PHRASES}
                className="text-hig-headline text-ink"
              />
            </Card>

            <Card className="flex flex-col items-center gap-2 p-6">
              <p className="text-hig-subhead self-start text-ink">GhostDiagram</p>
              <GhostDiagram className="h-28 w-48" />
            </Card>

            <Card className="flex flex-col items-center gap-3 p-6">
              <p className="text-hig-subhead self-start text-ink">SuccessFlourish</p>
              <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-success-tint">
                <SuccessFlourish key={flourishKey} />
              </div>
              <Button variant="secondary" size="sm" onClick={() => setFlourishKey((k) => k + 1)}>
                Replay
              </Button>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="relative h-32 overflow-hidden rounded-xl border border-rule">
              <AmbientBackground tone="idle" />
              <Card tone="glass-strong" className="absolute inset-4 flex items-center justify-center p-4">
                <p className="text-hig-footnote text-ink-secondary">tone=&quot;idle&quot;</p>
              </Card>
            </div>
            <div className="relative h-32 overflow-hidden rounded-xl border border-rule">
              <AmbientBackground tone="running" />
              <Card tone="glass-strong" className="absolute inset-4 flex items-center justify-center p-4">
                <p className="text-hig-footnote text-ink-secondary">tone=&quot;running&quot;</p>
              </Card>
            </div>
            <div className="relative h-32 overflow-hidden rounded-xl border border-rule">
              <AmbientBackground tone="success" />
              <Card tone="glass-strong" className="absolute inset-4 flex items-center justify-center p-4">
                <p className="text-hig-footnote text-ink-secondary">tone=&quot;success&quot;</p>
              </Card>
            </div>
          </div>
        </Section>
      </div>
    </main>
  );
}
