"use client";

import useSWR from "swr";
import Link from "next/link";
import { documentsApi, attachmentsApi, spacesApi } from "@/lib/api";
import type { Document, Space } from "@wiki/types";
import { PdfViewer } from "@/components/pdf/PdfViewer";
import { DocumentPermissionsPanel } from "@/components/DocumentPermissionsPanel";
import { DocumentVersionHistory } from "@/components/DocumentVersionHistory";
import { CollaborativeEditor } from "@/components/editor/CollaborativeEditor";
import { EditorCountBadge } from "@/components/editor/EditorCountBadge";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { useCollaboration } from "@/hooks/useCollaboration";
import { useAuth } from "@/lib/auth";
import { Chip, Skeleton, Card, CardContent } from "@heroui/react";
import { CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface Props { spaceId: string; docId: string }

export function DocumentView({ spaceId, docId }: Props) {
  const { user } = useAuth();
  const { data: doc, mutate } = useSWR<Document>(
    `doc:${docId}`,
    () => documentsApi.get(docId),
  );
  const { data: space } = useSWR<Space>(
    `space:${spaceId}`,
    () => spacesApi.get(spaceId),
  );

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [useFallbackEditor, setUseFallbackEditor] = useState(false);
  const loadedDocId = useRef<string | null>(null);

  const collab = useCollaboration({
    orgId: user?.orgId ?? doc?.orgId ?? "",
    documentId: docId,
    userId: user?.id ?? "",
    userName: user?.name ?? "You",
    enabled: Boolean(user && doc?.type === "page" && !useFallbackEditor),
  });

  useEffect(() => {
    if (!doc) return;
    if (loadedDocId.current === doc.id) return;
    loadedDocId.current = doc.id;
    setContent(doc.contentRef ?? "");
  }, [doc]);

  useEffect(() => {
    if (doc?.type !== "page" || collab.provider) return;

    const timer = setTimeout(() => {
      if (!collab.provider && collab.status === "disconnected") {
        setUseFallbackEditor(true);
      }
    }, 4000);

    return () => clearTimeout(timer);
  }, [doc?.type, collab.provider, collab.status]);

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

  if (!doc) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-4">
        <Skeleton className="w-1/3 h-4 rounded-md" />
        <Skeleton className="w-2/3 h-8 rounded-xl" />
        <Skeleton className="w-full h-96 rounded-xl" />
      </div>
    );
  }

  const showCollab = doc.type === "page" && collab.provider && user && !useFallbackEditor;
  const showFallback = doc.type === "page" && useFallbackEditor && user;
  const canEdit = doc.accessLevel === "edit";
  const activeSaveStatus = showFallback ? saveStatus : collab.saveStatus;
  const isConnected = showFallback ? true : collab.status === "connected";

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <nav
        aria-label="Breadcrumb"
        className="text-xs text-zinc-400 mb-5 flex items-center gap-1.5 flex-wrap"
      >
        <Link href="/spaces" className="hover:text-violet-600 dark:hover:text-violet-400 transition-colors">
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

      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 flex-1 leading-tight">
          {doc.title}
        </h1>
        {doc.type === "page" && user && (
          <div className="flex flex-col items-end gap-2 shrink-0">
            {!showFallback && (
              <EditorCountBadge count={collab.editorCount} status={collab.status} />
            )}
            <SaveIndicator status={activeSaveStatus} connected={isConnected} />
          </div>
        )}
      </div>

      {doc.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-5">
          {doc.tags.map((tag) => (
            <Chip key={tag} size="sm" variant="secondary" className="text-xs">
              {tag}
            </Chip>
          ))}
        </div>
      )}

      {(user?.role === "admin" || doc.ownerId === user?.id) && (
        <DocumentPermissionsPanel documentId={docId} />
      )}

      {doc.type === "page" && user && canEdit && (
        <DocumentVersionHistory
          documentId={docId}
          currentVersion={doc.version}
          canEdit
        />
      )}

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
      ) : showCollab ? (
        <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
          <CollaborativeEditor
            ydoc={collab.ydoc}
            provider={collab.provider!}
            readOnly={!canEdit}
          />
        </div>
      ) : showFallback ? (
        <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
          <RichTextEditor
            content={content}
            onChange={setContent}
            {...(canEdit ? { onAutoSave: handleAutoSave } : {})}
            readOnly={!canEdit}
          />
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-row items-center gap-3 py-12 justify-center text-zinc-400 p-5">
            <Clock size={18} className="animate-pulse" />
            <span className="text-sm">Connecting to editor…</span>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SaveIndicator({
  status,
  connected,
}: {
  status: "saved" | "saving" | "unsaved";
  connected: boolean;
}) {
  if (!connected) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full shrink-0">
        <AlertCircle size={11} />
        Reconnecting…
      </span>
    );
  }
  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-50 dark:bg-zinc-800 px-2.5 py-1 rounded-full animate-pulse shrink-0">
        Saving…
      </span>
    );
  }
  if (status === "unsaved") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full shrink-0">
        <AlertCircle size={11} />
        Unsaved
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full shrink-0">
      <CheckCircle2 size={11} />
      Saved
    </span>
  );
}
