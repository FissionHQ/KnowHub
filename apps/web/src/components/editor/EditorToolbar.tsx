"use client";

import { useRef } from "react";
import type { Editor } from "@tiptap/react";
import {
  Bold, Italic, Strikethrough, Code, Heading2, Heading3,
  List, ListOrdered, Quote, Minus, Table, Image, Undo, Redo,
  UnderlineIcon, Pilcrow, SquareCode, LinkIcon, Download, Upload,
} from "lucide-react";
import { Tooltip } from "@heroui/react";
import clsx from "clsx";
import { htmlToMarkdown, markdownToHtml, downloadFile, readTextFile } from "@/lib/markdownUtils";

interface Props {
  editor: Editor;
  onInsertImage: (src: string) => void;
  title?: string;
}

function ToolBtn({
  onClick,
  active,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <Tooltip.Trigger>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className={clsx(
            "p-1.5 rounded-md transition-colors",
            active
              ? "bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300"
              : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100",
          )}
        >
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Content>
        <p className="text-xs">{label}</p>
      </Tooltip.Content>
    </Tooltip>
  );
}

export function EditorToolbar({ editor, onInsertImage, title = "document" }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mdImportRef = useRef<HTMLInputElement>(null);

  async function handleExportMarkdown() {
    const md = htmlToMarkdown(editor.getHTML());
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    downloadFile(`${slug}.md`, md, "text/markdown");
  }

  async function handleImportMarkdown(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const md = await readTextFile(file);
    const html = await markdownToHtml(md);
    editor.commands.setContent(html);
    e.target.value = "";
  }

  return (
    <div className="flex items-center gap-0.5 flex-wrap px-3 py-2 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
      {/* hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => onInsertImage(reader.result as string);
          reader.readAsDataURL(file);
          e.target.value = "";
        }}
      />
      <input
        ref={mdImportRef}
        type="file"
        accept=".md,.markdown,text/markdown,text/plain"
        className="hidden"
        onChange={handleImportMarkdown}
      />

      <ToolBtn onClick={() => editor.chain().focus().undo().run()} label="Undo">
        <Undo size={14} />
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().redo().run()} label="Redo">
        <Redo size={14} />
      </ToolBtn>

      <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />

      <ToolBtn
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive("heading", { level: 2 })}
        label="Heading 2"
      >
        <Heading2 size={14} />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive("heading", { level: 3 })}
        label="Heading 3"
      >
        <Heading3 size={14} />
      </ToolBtn>

      <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />

      <ToolBtn
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
        label="Bold"
      >
        <Bold size={14} />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
        label="Italic"
      >
        <Italic size={14} />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive("underline")}
        label="Underline"
      >
        <UnderlineIcon size={14} />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive("strike")}
        label="Strikethrough"
      >
        <Strikethrough size={14} />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleCode().run()}
        active={editor.isActive("code")}
        label="Inline Code"
      >
        <Code size={14} />
      </ToolBtn>

      <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />

      <ToolBtn
        onClick={() => editor.chain().focus().setParagraph().run()}
        active={editor.isActive("paragraph")}
        label="Paragraph"
      >
        <Pilcrow size={14} />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")}
        label="Bullet List"
      >
        <List size={14} />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
        label="Ordered List"
      >
        <ListOrdered size={14} />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive("blockquote")}
        label="Blockquote"
      >
        <Quote size={14} />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        active={editor.isActive("codeBlock")}
        label="Code Block"
      >
        <SquareCode size={14} />
      </ToolBtn>

      <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />

      <ToolBtn
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        label="Divider"
      >
        <Minus size={14} />
      </ToolBtn>
      <ToolBtn
        onClick={() =>
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
        label="Insert Table"
      >
        <Table size={14} />
      </ToolBtn>
      <ToolBtn
        onClick={() => {
          const url = window.prompt("Enter URL");
          if (!url) return;
          editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
        }}
        active={editor.isActive("link")}
        label="Link"
      >
        <LinkIcon size={14} />
      </ToolBtn>
      <ToolBtn
        onClick={() => fileInputRef.current?.click()}
        label="Image"
      >
        <Image size={14} />
      </ToolBtn>

      <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />

      <ToolBtn onClick={() => mdImportRef.current?.click()} label="Import Markdown">
        <Upload size={14} />
      </ToolBtn>
      <ToolBtn onClick={handleExportMarkdown} label="Export Markdown">
        <Download size={14} />
      </ToolBtn>
    </div>
  );
}
