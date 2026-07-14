"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import { useEffect, useRef } from "react";
import { EditorToolbar } from "./EditorToolbar";

const lowlight = createLowlight(common);

interface Props {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  autoSaveMs?: number;
  onAutoSave?: (content: string) => void;
  readOnly?: boolean;
}

export function RichTextEditor({
  content,
  onChange,
  placeholder = "Start writing...",
  autoSaveMs = 3000,
  onAutoSave,
  readOnly = false,
}: Props) {
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Placeholder.configure({ placeholder }),
      Image,
      Link.configure({ openOnClick: false }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      CodeBlockLowlight.configure({ lowlight }),
    ],
    content,
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      if (readOnly) return;
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
    if (editor) {
      editor.setEditable(!readOnly);
    }
  }, [editor, readOnly]);

  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, []);

  if (!editor) return null;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {!readOnly && <EditorToolbar editor={editor} />}
      <EditorContent editor={editor} className="prose prose-sm max-w-none" />
    </div>
  );
}
