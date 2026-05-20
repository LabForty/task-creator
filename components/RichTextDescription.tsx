"use client";

import { useEffect, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Markdown } from "tiptap-markdown";

type Props = {
  label: string;
  description?: string;
  value: string;
  onValueChange: (next: string) => void;
  placeholder?: string;
};

// Toolbar buttons map to the same baseline you'd see in Jira's editor:
// inline marks + headings + lists + quote + code block + link.
type ToolDef = {
  key: string;
  label: string;
  title: string;
  isActive: (e: Editor) => boolean;
  apply: (e: Editor) => boolean;
};

const TOOLS: ToolDef[] = [
  {
    key: "bold",
    label: "B",
    title: "Bold (⌘B)",
    isActive: (e) => e.isActive("bold"),
    apply: (e) => e.chain().focus().toggleBold().run(),
  },
  {
    key: "italic",
    label: "I",
    title: "Italic (⌘I)",
    isActive: (e) => e.isActive("italic"),
    apply: (e) => e.chain().focus().toggleItalic().run(),
  },
  {
    key: "strike",
    label: "S",
    title: "Strikethrough",
    isActive: (e) => e.isActive("strike"),
    apply: (e) => e.chain().focus().toggleStrike().run(),
  },
  {
    key: "code",
    label: "</>",
    title: "Inline code",
    isActive: (e) => e.isActive("code"),
    apply: (e) => e.chain().focus().toggleCode().run(),
  },
  {
    key: "h2",
    label: "H2",
    title: "Heading 2",
    isActive: (e) => e.isActive("heading", { level: 2 }),
    apply: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    key: "h3",
    label: "H3",
    title: "Heading 3",
    isActive: (e) => e.isActive("heading", { level: 3 }),
    apply: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    key: "ul",
    label: "•",
    title: "Bullet list",
    isActive: (e) => e.isActive("bulletList"),
    apply: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    key: "ol",
    label: "1.",
    title: "Numbered list",
    isActive: (e) => e.isActive("orderedList"),
    apply: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    key: "quote",
    label: "❝",
    title: "Quote",
    isActive: (e) => e.isActive("blockquote"),
    apply: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    key: "codeblock",
    label: "{ }",
    title: "Code block",
    isActive: (e) => e.isActive("codeBlock"),
    apply: (e) => e.chain().focus().toggleCodeBlock().run(),
  },
];

function getMarkdown(editor: Editor): string {
  const storage = (editor.storage as { markdown?: { getMarkdown: () => string } }).markdown;
  return storage ? storage.getMarkdown() : editor.getText();
}

export function RichTextDescription({
  label,
  description,
  value,
  onValueChange,
  placeholder,
}: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // We use the Link extension below — turn off StarterKit's default
        // link if it ships one in this version, to avoid duplicate schema.
        link: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer" },
      }),
      Markdown.configure({
        html: false,
        tightLists: true,
        bulletListMarker: "-",
        linkify: true,
        breaks: false,
        transformPastedText: true,
        transformCopiedText: false,
      }),
    ],
    content: value,
    immediatelyRender: false,
    onUpdate: ({ editor: e }) => {
      onValueChange(getMarkdown(e));
    },
    editorProps: {
      attributes: {
        class:
          // Prose-y but theme-aware. tw doesn't ship a dark prose by default
          // in this project; we colour explicitly via theme tokens.
          "tiptap-prose min-h-[280px] max-h-[60vh] overflow-y-auto p-3 " +
          "outline-none text-hig-body text-ink leading-relaxed",
      },
    },
  });

  // External value updates (loading a saved draft, programmatic edits) should
  // sync into the editor — but not on every onUpdate cycle, that would loop.
  // Compare against the editor's current markdown to know when an external
  // change actually happened.
  useEffect(() => {
    if (!editor) return;
    const current = getMarkdown(editor);
    if (current === value) return;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  // Track focus so the toolbar can show an "active" border ring.
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!editor) return;
    const onFocus = () => setFocused(true);
    const onBlur = () => setFocused(false);
    editor.on("focus", onFocus);
    editor.on("blur", onBlur);
    return () => {
      editor.off("focus", onFocus);
      editor.off("blur", onBlur);
    };
  }, [editor]);

  function setLink() {
    if (!editor) return;
    const previous = (editor.getAttributes("link").href as string | undefined) ?? "";
    const url = window.prompt("Link URL", previous);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  return (
    <label className="flex flex-col gap-1.5" data-editor-field-inner>
      <span data-label className="text-hig-subhead font-medium text-ink">{label}</span>
      {description && (
        <span className="text-hig-footnote text-ink-secondary">{description}</span>
      )}
      <div
        className={
          "rounded-md border bg-surface transition-all duration-150 ease-hig " +
          (focused
            ? "border-accent shadow-focus"
            : "border-rule")
        }
      >
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-rule">
          {editor &&
            TOOLS.map((t) => (
              <ToolbarButton
                key={t.key}
                title={t.title}
                active={t.isActive(editor)}
                onClick={() => t.apply(editor)}
              >
                {t.label}
              </ToolbarButton>
            ))}
          {editor && (
            <ToolbarButton
              title="Link"
              active={editor.isActive("link")}
              onClick={setLink}
            >
              ↗
            </ToolbarButton>
          )}
        </div>
        <EditorContent
          editor={editor}
          data-input
          // Placeholder via :empty pseudo-element doesn't work inside ProseMirror,
          // so we render a hint overlay when there's no content.
          aria-label={label}
        />
        {editor && editor.isEmpty && (
          <p
            className="pointer-events-none -mt-[260px] px-3 pt-3 text-ink-tertiary text-hig-body italic"
            aria-hidden
          >
            {placeholder ?? "Start typing…"}
          </p>
        )}
      </div>
    </label>
  );
}

function ToolbarButton({
  children,
  title,
  active,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        // Keep editor focus when clicking the toolbar — otherwise the active
        // selection collapses and the mark toggle has no target.
        e.preventDefault();
      }}
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active ? "true" : "false"}
      className={
        "h-7 min-w-[28px] px-1.5 rounded text-hig-footnote font-medium " +
        "transition-colors focus:outline-none focus:ring-2 focus:ring-accent " +
        (active
          ? "bg-accent-tint text-accent"
          : "text-ink-secondary hover:bg-surface-muted hover:text-ink")
      }
    >
      {children}
    </button>
  );
}
