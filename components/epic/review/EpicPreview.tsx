"use client";

import type { SubTask } from "@/lib/subtasks/types";

type Props = { title: string; descriptionHtml: string; subtasks: SubTask[] };

export function EpicPreview({ title, descriptionHtml, subtasks }: Props) {
  return (
    <section aria-label="Epic preview" className="flex flex-col gap-3">
      <h2 className="text-hig-title3">{title || "(untitled epic)"}</h2>
      <div className="tiptap-prose text-hig-body text-ink" dangerouslySetInnerHTML={{ __html: descriptionHtml }} />
      <div>
        <h3 className="hig-section-label">Tasks ({subtasks.length})</h3>
        <ul className="list-disc ml-5">
          {subtasks.map((s) => (
            <li key={s.id} className="text-hig-footnote text-ink-secondary">{s.title || "(untitled)"}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
