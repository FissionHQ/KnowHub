"use client";

import type { Editor } from "@tiptap/react";
import { useState } from "react";
import { Button } from "@heroui/react";

interface Props {
  editor: Editor;
}

export function LinkPopover({ editor }: Props) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");

  function applyLink() {
    if (!url) {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
    setOpen(false);
    setUrl("");
  }

  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} className="text-xs h-7 px-2">
        Link
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://..."
        className="w-40 h-7 text-xs border border-zinc-200 rounded-md px-2"
        onKeyDown={(e) => e.key === "Enter" && applyLink()}
      />
      <Button size="sm" variant="primary" onClick={applyLink} className="h-7 text-xs">Set</Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)} className="h-7 text-xs">×</Button>
    </div>
  );
}
