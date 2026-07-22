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
import Underline from "@tiptap/extension-underline";
import Collaboration from "@tiptap/extension-collaboration";
import { common, createLowlight } from "lowlight";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import type * as Y from "yjs";
import { useEffect } from "react";
import { EditorToolbar } from "./EditorToolbar";
import { FileEmbedExtension } from "./FileEmbedExtension";

const lowlight = createLowlight(common);

interface Props {
  ydoc: Y.Doc;
  provider: HocuspocusProvider;
  placeholder?: string;
  readOnly?: boolean;
  documentId?: string;
}

export function CollaborativeEditor({
  ydoc,
  provider,
  placeholder = "Start writing...",
  readOnly = false,
  documentId,
}: Props) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ codeBlock: false, history: false }),
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
      Collaboration.configure({ document: ydoc, field: "default" }),
    ],
    editable: !readOnly,
    editorProps: {
      attributes: { class: "prose prose-sm max-w-none focus:outline-none" },
    },
  });

  useEffect(() => {
    if (editor) editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  if (!editor) return null;

  return (
    <div className="border border-gray-200 dark:border-zinc-700 rounded-lg overflow-hidden">
      {!readOnly && (
        <EditorToolbar
          editor={editor}
          onInsertImage={(src) => editor.chain().focus().setImage({ src }).run()}
          documentId={documentId}
        />
      )}
      <EditorContent editor={editor} className="prose prose-sm max-w-none" />
    </div>
  );
}
