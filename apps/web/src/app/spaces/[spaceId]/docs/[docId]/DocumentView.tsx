"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import Link from "next/link";
import { documentsApi, attachmentsApi, spacesApi } from "@/lib/api";
import type { Document, Space } from "@wiki/types";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { PdfViewer } from "@/components/pdf/PdfViewer";
import { DocumentPermissionsPanel } from "@/components/DocumentPermissionsPanel";
import { VersionHistoryPanel } from "@/components/editor/VersionHistoryPanel";
import { PageMetadataPanel } from "@/components/editor/PageMetadataPanel";
import { Chip, Skeleton, Card, CardContent } from "@heroui/react";
import { CheckCircle2, Clock, AlertCircle } from "lucide-react";

type SaveStatus = "saved" | "saving" | "unsaved";

interface Props { spaceId: string; docId: string }

export function DocumentView({ spaceId, docId }: Props) {
  const { data: doc, mutate } = useSWR<Document>(
    `doc:${docId}`,
    () => documentsApi.get(docId),
  );
  const { data: space } = useSWR<Space>(
    `space:${spaceId}`,
    () => spacesApi.get(spaceId),
  );

  const [content, setContent] = useState<string>("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  if (doc && content === "" && doc.contentRef) {
    setContent(doc.contentRef);
  }

  const loadPdfUrl = useCallback(async () => {
    if (!doc?.id) return;
    const att = await attachmentsApi.getStatus(doc.id).catch(() => null);
    if (att?.ready) {
      const { url } = await attachmentsApi.getViewUrl(doc.id);
      setPdfUrl(url);
    }
  }, [doc?.id]);

  if (doc?.type === "pdf" && !pdfUrl) {
    loadPdfUrl();
  }

  const handleAutoSave = useCallback(
    async (html: string) => {
      if (!doc) return;
      setSaveStatus("saving");
      try {
        await documentsApi.update(docId, { content: html });
        setSaveStatus("saved");
        mutate();
      } catch {
        setSaveStatus("unsaved");
      }
    },
    [doc, docId, mutate],
  );

  const handleRestore = useCallback((restoredContent: string) => {
    setContent(restoredContent);
    mutate();
  }, [mutate]);

  if (!doc) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-4">
        <Skeleton className="w-1/3 h-4 rounded-md" />
        <Skeleton className="w-2/3 h-8 rounded-xl" />
        <Skeleton className="w-full h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <nav
        aria-label="Breadcrumb"
        className="text-xs text-zinc-400 mb-5 flex items-center gap-1.5 flex-wrap"
      >
        <Link
          href="/spaces"
          className="hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
        >
          Spaces
        </Link>
        <span aria-hidden="true">/</span>
        <Link
          href={`/spaces/${spaceId}`}
          className="text-zinc-500 dark:text-zinc-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors truncate max-w-[160px]"
        >
          {space?.name ?? "Space"}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-zinc-700 dark:text-zinc-200 font-medium truncate max-w-[240px]">
          {doc.title}
        </span>
      </nav>

      {/* Title + save status */}
      <div className="flex items-start gap-3 mb-4">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 flex-1 leading-tight">{doc.title}</h1>
        <SaveIndicator status={saveStatus} />
      </div>

      {/* Tags (read-only summary — editable in PageMetadataPanel) */}
      {doc.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-5">
          {doc.tags.map((tag) => (
            <Chip key={tag} size="sm" variant="secondary" className="text-xs">
              {tag}
            </Chip>
          ))}
        </div>
      )}

      {/* ED-5: Page metadata */}
      <PageMetadataPanel doc={doc} onUpdate={(updated) => mutate(updated, false)} />

      {/* ED-3: Version history */}
      {doc.type === "page" && (
        <VersionHistoryPanel documentId={docId} onRestore={handleRestore} />
      )}

      <DocumentPermissionsPanel documentId={docId} />

      {/* Content */}
      {doc.type === "pdf" ? (
        pdfUrl ? (
          <PdfViewer url={pdfUrl} filename={doc.title} />
        ) : (
          <Card>
            <CardContent className="flex flex-row items-center gap-3 py-12 justify-center text-zinc-400 p-5">
              <Clock size={18} className="animate-pulse" />
              <span className="text-sm">PDF is being processed…</span>
            </CardContent>
          </Card>
        )
      ) : (
        <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
          <RichTextEditor
            content={content}
            onChange={setContent}
            onAutoSave={handleAutoSave}
          />
        </div>
      )}
    </div>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full shrink-0 mt-1">
        <CheckCircle2 size={11} />
        Saved
      </span>
    );
  }
  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-50 dark:bg-zinc-800 px-2.5 py-1 rounded-full animate-pulse shrink-0 mt-1">
        Saving…
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full shrink-0 mt-1">
      <AlertCircle size={11} />
      Unsaved
    </span>
  );
}
