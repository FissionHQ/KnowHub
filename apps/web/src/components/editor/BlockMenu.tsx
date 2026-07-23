"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import {
  Plus, Pilcrow, Heading2, Heading3, List, ListOrdered,
  Quote, SquareCode, Minus, Table, Image, LinkIcon,
  Paperclip, Upload, Download, Bold, Italic, UnderlineIcon,
  Strikethrough, Code, Undo, Redo,
} from "lucide-react";
import clsx from "clsx";
import { htmlToMarkdown, markdownToHtml, downloadFile, readTextFile } from "@/lib/markdownUtils";
import { attachmentsApi } from "@/lib/api";
import type { FileEmbedAttributes } from "./FileEmbedExtension";

interface BlockMenuProps {
  editor: Editor;
  title?: string;
  documentId?: string;
}

export function BlockMenu({ editor, title = "document", documentId }: BlockMenuProps) {
  const [open, setOpen] = useState(false);
  const [btnPos, setBtnPos] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mdImportRef = useRef<HTMLInputElement>(null);
  const fileUploadRef = useRef<HTMLInputElement>(null);

  const updatePosition = useCallback(() => {
    const { view } = editor;
    if (!view.hasFocus() && !open) return;
    const { from } = view.state.selection;
    const coords = view.coordsAtPos(from);
    const editorRect = (view.dom as HTMLElement).getBoundingClientRect();
    setBtnPos({
      top: coords.top + window.scrollY - 2,
      left: editorRect.left + window.scrollX - 32,
    });
  }, [editor, open]);

  useEffect(() => {
    updatePosition();
    editor.on("selectionUpdate", updatePosition);
    editor.on("focus", updatePosition);
    return () => {
      editor.off("selectionUpdate", updatePosition);
      editor.off("focus", updatePosition);
    };
  }, [editor, updatePosition]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function run(action: () => void) {
    action();
    setOpen(false);
    editor.commands.focus();
  }

  async function handleExportMarkdown() {
    const md = htmlToMarkdown(editor.getHTML());
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    downloadFile(`${slug}.md`, md, "text/markdown");
    setOpen(false);
  }

  async function handleImportMarkdown(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const md = await readTextFile(file);
    const html = await markdownToHtml(md);
    editor.commands.setContent(html);
    e.target.value = "";
    setOpen(false);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !documentId) return;
    try {
      const { attachmentId } = await attachmentsApi.upload(documentId, file);
      const attrs: FileEmbedAttributes = {
        attachmentId,
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        fileSize: file.size,
      };
      const cmd = (editor.commands as unknown as Record<string, (a: FileEmbedAttributes) => boolean>)["insertFileEmbed"];
      if (cmd) cmd(attrs);
    } catch (err) {
      alert(`Upload failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
    e.target.value = "";
    setOpen(false);
  }

  const groups = [
    {
      label: "History",
      items: [
        { label: "Undo", icon: <Undo size={14} />, action: () => editor.chain().focus().undo().run() },
        { label: "Redo", icon: <Redo size={14} />, action: () => editor.chain().focus().redo().run() },
      ],
    },
    {
      label: "Text",
      items: [
        { label: "Paragraph", icon: <Pilcrow size={14} />, action: () => editor.chain().focus().setParagraph().run(), active: editor.isActive("paragraph") },
        { label: "Heading 2", icon: <Heading2 size={14} />, action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), active: editor.isActive("heading", { level: 2 }) },
        { label: "Heading 3", icon: <Heading3 size={14} />, action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(), active: editor.isActive("heading", { level: 3 }) },
      ],
    },
    {
      label: "Format",
      items: [
        { label: "Bold", icon: <Bold size={14} />, action: () => editor.chain().focus().toggleBold().run(), active: editor.isActive("bold") },
        { label: "Italic", icon: <Italic size={14} />, action: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive("italic") },
        { label: "Underline", icon: <UnderlineIcon size={14} />, action: () => editor.chain().focus().toggleUnderline().run(), active: editor.isActive("underline") },
        { label: "Strikethrough", icon: <Strikethrough size={14} />, action: () => editor.chain().focus().toggleStrike().run(), active: editor.isActive("strike") },
        { label: "Inline Code", icon: <Code size={14} />, action: () => editor.chain().focus().toggleCode().run(), active: editor.isActive("code") },
      ],
    },
    {
      label: "Blocks",
      items: [
        { label: "Bullet List", icon: <List size={14} />, action: () => editor.chain().focus().toggleBulletList().run(), active: editor.isActive("bulletList") },
        { label: "Ordered List", icon: <ListOrdered size={14} />, action: () => editor.chain().focus().toggleOrderedList().run(), active: editor.isActive("orderedList") },
        { label: "Blockquote", icon: <Quote size={14} />, action: () => editor.chain().focus().toggleBlockquote().run(), active: editor.isActive("blockquote") },
        { label: "Code Block", icon: <SquareCode size={14} />, action: () => editor.chain().focus().toggleCodeBlock().run(), active: editor.isActive("codeBlock") },
        { label: "Divider", icon: <Minus size={14} />, action: () => editor.chain().focus().setHorizontalRule().run() },
        { label: "Table", icon: <Table size={14} />, action: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
      ],
    },
    {
      label: "Insert",
      items: [
        {
          label: "Link", icon: <LinkIcon size={14} />, active: editor.isActive("link"),
          action: () => {
            const url = window.prompt("Enter URL");
            if (url) editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
          },
        },
        { label: "Image", icon: <Image size={14} />, action: () => fileInputRef.current?.click() },
        { label: "Attach File", icon: <Paperclip size={14} />, action: () => fileUploadRef.current?.click() },
        { label: "Import Markdown", icon: <Upload size={14} />, action: () => mdImportRef.current?.click() },
        { label: "Export Markdown", icon: <Download size={14} />, action: handleExportMarkdown },
      ],
    },
  ];

  if (!btnPos || typeof window === "undefined") return null;

  return createPortal(
    <>
      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => editor.chain().focus().setImage({ src: reader.result as string }).run();
          reader.readAsDataURL(file);
          e.target.value = "";
          setOpen(false);
        }}
      />
      <input ref={mdImportRef} type="file" accept=".md,.markdown,text/markdown,text/plain" className="hidden" onChange={handleImportMarkdown} />
      <input ref={fileUploadRef} type="file" className="hidden" onChange={handleFileUpload} />

      {/* + button */}
      <button
        ref={btnRef}
        type="button"
        onMouseDown={(e) => { e.preventDefault(); setOpen((v) => !v); }}
        style={{ position: "absolute", top: btnPos.top, left: btnPos.left + 24 }}
        className="z-40 flex items-center justify-center w-5 h-5 text-zinc-900 dark:text-zinc-100 transition-colors"
        aria-label="Insert block"
      >
        <Plus size={18} strokeWidth={2.5} />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          ref={menuRef}
          style={{ position: "absolute", top: btnPos.top + 24, left: btnPos.left + 24 }}
          className="z-50 w-52 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl py-1 overflow-y-auto max-h-80"
        >
          {groups.map((group) => (
            <div key={group.label}>
              <p className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                {group.label}
              </p>
              {group.items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); run(item.action); }}
                  className={clsx(
                    "flex items-center gap-2.5 w-full px-3 py-1.5 text-sm text-left transition-colors",
                    item.active
                      ? "text-[#f25011] bg-orange-50 dark:bg-orange-950/40"
                      : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  )}
                >
                  <span className="shrink-0">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </>,
    document.body,
  );
}
