"use client";

import type { Editor } from "@tiptap/react";
import {
  Bold, Italic, Strikethrough, Underline, Code, Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Minus, Table, Undo, Redo,
} from "lucide-react";
import { Tooltip } from "@heroui/react";
import clsx from "clsx";
import { LinkPopover } from "./LinkPopover";
import { ImageUploadButton } from "./ImageUploadButton";

interface Props { editor: Editor }

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

export function EditorToolbar({ editor }: Props) {
  return (
    <div className="flex items-center gap-0.5 flex-wrap px-3 py-2 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
      <ToolBtn onClick={() => editor.chain().focus().undo().run()} label="Undo">
        <Undo size={14} />
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().redo().run()} label="Redo">
        <Redo size={14} />
      </ToolBtn>

      <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />

      <ToolBtn
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive("heading", { level: 1 })}
        label="Heading 1"
      >
        <Heading1 size={14} />
      </ToolBtn>
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
        <Underline size={14} />
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

      <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />

      <LinkPopover editor={editor} />
      <ImageUploadButton editor={editor} />
    </div>
  );
}
