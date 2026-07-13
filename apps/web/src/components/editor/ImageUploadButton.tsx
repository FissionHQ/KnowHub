"use client";

import type { Editor } from "@tiptap/react";
import { useRef } from "react";
import { ImageIcon } from "lucide-react";
import { attachmentsApi } from "@/lib/api";
import { Tooltip } from "@heroui/react";
import clsx from "clsx";

interface Props {
  editor: Editor;
}

export function ImageUploadButton({ editor }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    try {
      const { url } = await attachmentsApi.uploadImage(file);
      editor.chain().focus().setImage({ src: url }).run();
    } catch {
      // fallback: use object URL for local preview
      const url = URL.createObjectURL(file);
      editor.chain().focus().setImage({ src: url }).run();
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      <Tooltip>
        <Tooltip.Trigger>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            aria-label="Insert image"
            className={clsx(
              "p-1.5 rounded-md transition-colors",
              "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800",
            )}
          >
            <ImageIcon size={14} />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Content><p className="text-xs">Insert image</p></Tooltip.Content>
      </Tooltip>
    </>
  );
}
