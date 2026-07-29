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
import { useEffect, useRef, useCallback } from "react";
import { BlockMenu } from "./BlockMenu";
import Underline from "@tiptap/extension-underline";
import { FileEmbedExtension } from "./FileEmbedExtension";

const lowlight = createLowlight(common);

interface Props {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  autoSaveMs?: number;
  onAutoSave?: (content: string) => void;
  title?: string;
  documentId?: string;
  readOnly?: boolean;
}

export function RichTextEditor({
  content,
  onChange,
  placeholder = "Start writing...",
  autoSaveMs = 3000,
  onAutoSave,
  title = "document",
  documentId,
  readOnly = false,
}: Props) {
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirty = useRef(false);

  const editor = useEditor({
    immediatelyRender: false,
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
      FileEmbedExtension,
    ],
    content,
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      if (readOnly) return;
      const html = editor.getHTML();
      onChange(html);
      isDirty.current = true;

      // Auto-save debounce
      if (onAutoSave) {
        if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = setTimeout(() => {
          isDirty.current = false;
          onAutoSave(html);
        }, autoSaveMs);
      }
    },
  });

  // Sync external content changes (e.g. version restore) — skip if editor has unsaved changes
  useEffect(() => {
    if (editor && !isDirty.current && content !== editor.getHTML()) {
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleInsertImage = useCallback((src: string) => {
    editor?.chain().focus().setImage({ src }).run();
  }, [editor]);

  if (!editor) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        Loading editor…
      </div>
    );
  }

  return (
    <>
      {!readOnly && <BlockMenu editor={editor} title={title} {...(documentId !== undefined && { documentId })} />}
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none focus:outline-none"
        onMouseDown={(e) => {
          if (!(e.metaKey || e.ctrlKey)) return;
          const target = (e.target as HTMLElement).closest("a");
          if (target) {
            e.preventDefault();
            window.open((target as HTMLAnchorElement).href, "_blank", "noopener,noreferrer");
          }
        }}
      />
    </>
  );
}
