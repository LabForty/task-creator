"use client";

import { useId, useRef, useState } from "react";
import type { JiraDraftAttachment } from "@/lib/jira/metadata";
import { MAX_DRAFT_ATTACHMENT_BYTES_DEFAULT } from "@/lib/jira/metadata";

type Props = {
  value: JiraDraftAttachment[];
  onChange: (next: JiraDraftAttachment[]) => void;
  maxBytes?: number;
  disabled?: boolean;
};

function humanSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

let attachmentSeq = 0;

export function AttachmentsField({
  value,
  onChange,
  maxBytes = MAX_DRAFT_ATTACHMENT_BYTES_DEFAULT,
  disabled,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [tooLarge, setTooLarge] = useState<string[]>([]);

  function accept(files: FileList | File[]) {
    const ok: JiraDraftAttachment[] = [];
    const bad: string[] = [];
    for (const f of Array.from(files)) {
      if (f.size > maxBytes) bad.push(f.name);
      else ok.push({ id: `att-${++attachmentSeq}`, file: f });
    }
    setTooLarge(bad);
    if (ok.length) onChange([...value, ...ok]);
  }

  function remove(id: string, name: string) {
    onChange(value.filter((v) => v.id !== id));
    setTooLarge((cur) => cur.filter((n) => n !== name));
  }

  return (
    <div className="flex flex-col gap-1.5" data-field="attachments">
      <label
        className="text-hig-subhead font-medium text-ink"
        htmlFor={inputId}
      >
        Attachments
      </label>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length) accept(e.dataTransfer.files);
        }}
        className="rounded-md border border-dashed border-rule bg-surface-muted px-3 py-4 text-hig-footnote text-ink-secondary text-center cursor-pointer"
      >
        {value.length === 0
          ? "Drop files here or click to browse"
          : "Add more files…"}
      </div>
      <input
        id={inputId}
        ref={inputRef}
        aria-label="Choose files"
        type="file"
        multiple
        onChange={(e) => {
          if (e.target.files) {
            accept(e.target.files);
            e.target.value = "";
          }
        }}
        disabled={disabled}
        className="sr-only"
      />
      {tooLarge.length > 0 && (
        <ul className="text-hig-footnote text-danger">
          {tooLarge.map((n) => (
            <li key={n}>
              File too large (max {humanSize(maxBytes)}): {n}
            </li>
          ))}
        </ul>
      )}
      {value.length > 0 && (
        <ul className="rounded-md border border-rule bg-surface divide-y divide-rule">
          {value.map((a) => (
            <li
              key={a.id}
              className="px-3 py-1.5 flex items-center gap-3 text-hig-footnote"
            >
              <span className="flex-1 truncate">{a.file.name}</span>
              <span className="text-ink-secondary">
                {humanSize(a.file.size)}
              </span>
              <button
                type="button"
                aria-label={`Remove ${a.file.name}`}
                onClick={() => remove(a.id, a.file.name)}
                className="opacity-60 hover:opacity-100"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
