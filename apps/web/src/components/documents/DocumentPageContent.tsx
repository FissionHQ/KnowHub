"use client";

import { useCallback, useEffect, useState } from "react";
import { mutate } from "swr";
import type { Document } from "@wiki/types";
import { documentsApi } from "@/lib/api";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { Spinner } from "@heroui/react";

type SaveStatus = "saved" | "saving" | "unsaved";

interface Props {
  documentId: string;
  fullDocument: Document | null;
  canEdit: boolean;
  onSaveStatusChange?: (status: SaveStatus) => void;
  onContentSaved?: () => void;
}

export function DocumentPageContent({
  documentId,
  fullDocument,
  canEdit,
  onSaveStatusChange,
  onContentSaved,
}: Props) {
  const [content, setContent] = useState("");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (fullDocument) {
      setContent(fullDocument.contentRef ?? "");
      setInitialized(true);
    }
  }, [fullDocument]);

  const handleAutoSave = useCallback(
    async (html: string) => {
      onSaveStatusChange?.("saving");
      try {
        await documentsApi.update(documentId, { content: html });
        onSaveStatusChange?.("saved");
        await mutate(`doc:${documentId}`);
        onContentSaved?.();
      } catch {
        onSaveStatusChange?.("unsaved");
      }
    },
    [documentId, onContentSaved, onSaveStatusChange],
  );

  if (!initialized) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-400">
        <Spinner size="sm" />
      </div>
    );
  }

  if (canEdit) {
    return (
      <RichTextEditor
        content={content}
        onChange={setContent}
        onAutoSave={handleAutoSave}
        placeholder="Start writing…"
        variant="embedded"
      />
    );
  }

  if (!content || content === "<p></p>") {
    return <p className="text-sm text-zinc-400 py-8">This document is empty.</p>;
  }

  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none text-sm"
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
