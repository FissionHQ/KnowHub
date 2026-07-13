"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import { useEffect, useRef } from "react";
import clsx from "clsx";
import { EditorToolbar } from "./EditorToolbar";

const lowlight = createLowlight(common);

interface Props {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  autoSaveMs?: number;
  onAutoSave?: (content: string) => void;
  variant?: "default" | "embedded";
}

export function RichTextEditor({
  content,
  onChange,
  placeholder = "Start writing...",
  autoSaveMs = 3000,
  onAutoSave,
  variant = "default",
}: Props) {
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Placeholder.configure({ placeholder }),
      Underline,
      Image,
      Link.configure({ openOnClick: false }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      CodeBlockLowlight.configure({ lowlight }),
    ],
    content,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html);

      // Auto-save debounce
      if (onAutoSave) {
        if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = setTimeout(() => onAutoSave(html), autoSaveMs);
      }
    },
  });

  // Sync external content changes (e.g. version restore)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, []);

  if (!editor) return null;

  const isEmbedded = variant === "embedded";

  return (
    <div
      className={clsx(
        isEmbedded
          ? "flex flex-col"
          : "border border-gray-200 rounded-lg overflow-hidden",
      )}
    >
      <div
        className={clsx(
          isEmbedded && "shrink-0 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950",
        )}
      >
        <EditorToolbar editor={editor} />
      </div>
      <EditorContent
        editor={editor}
        className={clsx(
          "prose prose-sm dark:prose-invert max-w-none",
          isEmbedded && "px-1 py-3 [&_.ProseMirror]:min-h-[8rem] [&_.ProseMirror]:outline-none",
        )}
      />
    </div>
  );
}
