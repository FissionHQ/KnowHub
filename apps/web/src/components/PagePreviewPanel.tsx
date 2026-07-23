"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { ExternalLink, CheckCircle2, AlertCircle, Clock, ChevronRight } from "lucide-react";
import { Card, CardContent, Skeleton } from "@heroui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { documentsApi, attachmentsApi } from "@/lib/api";
import { CollaborativeEditor } from "@/components/editor/CollaborativeEditor";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { useCollaboration } from "@/hooks/useCollaboration";
import { useAuth } from "@/lib/auth";
import type { Document } from "@wiki/types";

const PdfViewer = dynamic(
  () => import("@/components/pdf/PdfViewer").then((m) => ({ default: m.PdfViewer })),
  { ssr: false },
);

type SaveStatus = "saved" | "saving" | "unsaved";

function isPdfViewerDoc(doc: Pick<Document, "type" | "contentRef">) {
  return doc.type === "pdf" && !doc.contentRef;
}
function isEditableDoc(doc: Pick<Document, "type" | "contentRef">) {
  return doc.type === "page" || (doc.type === "pdf" && Boolean(doc.contentRef));
}

interface Props {
  spaceId: string;
  docId: string;
  open: boolean;
  onClose: () => void;
}

export function PagePreviewPanel({ spaceId, docId, open, onClose }: Props) {
  const { user, loading: authLoading } = useAuth();
  const { data: doc, mutate } = useSWR<Document>(docId ? `doc:${docId}` : null, () => documentsApi.get(docId));

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [useFallbackEditor, setUseFallbackEditor] = useState(false);
  const [title, setTitle] = useState("");
  const titleFocused = useRef(false);
  const loadedDocId = useRef<string | null>(null);
  const prevCollabSaveStatus = useRef<SaveStatus>("saved");

  const canEdit = Boolean(user && (user.role === "admin" || doc?.accessLevel === "edit"));

  const collab = useCollaboration({
    orgId: user?.orgId ?? doc?.orgId ?? "",
    documentId: docId,
    userId: user?.id ?? "",
    userName: user?.name ?? "You",
    canEdit,
    enabled: Boolean(docId && user && doc && isEditableDoc(doc) && !useFallbackEditor),
  });

  useEffect(() => {
    if (!doc) return;
    if (loadedDocId.current === doc.id) return;
    loadedDocId.current = doc.id;
    setContent(doc.contentRef ?? "");
    setTitle(doc.title);
    setUseFallbackEditor(false);
  }, [doc]);

  useEffect(() => {
    if (!doc || titleFocused.current) return;
    setTitle(doc.title);
  }, [doc?.title]);

  useEffect(() => {
    if (!doc || !isEditableDoc(doc) || useFallbackEditor) return;
    if (collab.status === "connected") return;

    const timer = setTimeout(() => {
      setUseFallbackEditor((prev) => {
        if (prev) return prev;
        return true;
      });
    }, 4000);

    return () => clearTimeout(timer);
  }, [doc?.id, doc?.type, useFallbackEditor, collab.status]);

  useEffect(() => {
    if (useFallbackEditor) return;
    const prev = prevCollabSaveStatus.current;
    prevCollabSaveStatus.current = collab.saveStatus;
    if (prev === "saving" && collab.saveStatus === "saved") void mutate();
  }, [collab.saveStatus, useFallbackEditor, mutate]);

  const loadPdfUrl = useCallback(async () => {
    if (!doc?.id) return;
    const items = await attachmentsApi.listByDocument(doc.id).catch(() => []);
    const att = items[0];
    if (att?.ready) setPdfUrl(attachmentsApi.viewProxyUrl(att.attachmentId));
  }, [doc?.id]);

  useEffect(() => {
    if (!doc || !isPdfViewerDoc(doc) || pdfUrl) return;
    let cancelled = false;
    const poll = async () => { if (!cancelled) await loadPdfUrl(); };
    void poll();
    const interval = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [doc?.type, doc?.id, pdfUrl, loadPdfUrl]);

  const handleAutoSave = useCallback(async (html: string) => {
    if (!doc) return;
    setSaveStatus("saving");
    try {
      await documentsApi.update(docId, { content: html });
      setSaveStatus("saved");
      void mutate();
    } catch {
      setSaveStatus("unsaved");
    }
  }, [doc, docId, mutate]);

  async function handleTitleBlur() {
    if (!canEdit || !doc) return;
    const trimmed = title.trim();
    if (!trimmed || trimmed === doc.title) return;
    setSaveStatus("saving");
    try {
      const updated = await documentsApi.update(docId, { title: trimmed });
      mutate(updated, false);
      void globalMutate(`space:${spaceId}:docs`);
      void globalMutate("favorites");
      void globalMutate("recently-updated");
      setSaveStatus("saved");
    } catch {
      setSaveStatus("unsaved");
    }
  }

  const showPageEditor = Boolean(doc && isEditableDoc(doc) && user);
  const showFallback = showPageEditor && (useFallbackEditor || (!collab.provider && !authLoading));
  const activeSaveStatus = showFallback ? saveStatus : collab.saveStatus;
  const connectionStatus = showFallback ? "connected" : collab.status;

  return (
    <>
      {open && <div className="fixed inset-0 z-40" onClick={onClose} />}

      <div
        className={`fixed top-0 right-0 h-full w-[60%] min-w-[480px] z-50 flex flex-col bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-700 shadow-2xl transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-200 dark:border-zinc-700 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            title="Close preview"
          >
            <ChevronRight size={18} />
          </button>
          <div className="flex items-center gap-2">
            {doc && (
              <span className="font-semibold text-sm text-zinc-800 dark:text-zinc-100 truncate max-w-[200px]">
                {doc.title}
              </span>
            )}
          </div>
          <div className="flex-1" />
          {doc && isEditableDoc(doc) && user && (
            <SaveIndicator status={activeSaveStatus} connectionStatus={connectionStatus} />
          )}
          <Link
            href={`/spaces/${spaceId}/docs/${docId}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#f25011] hover:underline shrink-0"
          >
            <ExternalLink size={13} />
            Open page
          </Link>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {!doc ? (
            <div className="space-y-4">
              <Skeleton className="w-2/3 h-8 rounded-xl" />
              <Skeleton className="w-full h-96 rounded-xl" />
            </div>
          ) : (
            <>
              {/* Title */}
              <div className="mb-4">
                {canEdit ? (
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onFocus={() => { titleFocused.current = true; }}
                    onBlur={() => { titleFocused.current = false; handleTitleBlur(); }}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                    className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 w-full leading-tight bg-transparent border-none outline-none focus:ring-0 placeholder:text-zinc-300 dark:placeholder:text-zinc-600"
                    placeholder="Untitled"
                  />
                ) : (
                  <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 leading-tight">
                    {doc.title}
                  </h1>
                )}
              </div>

              {/* Editor */}
              {isPdfViewerDoc(doc) ? (
                pdfUrl ? (
                  <PdfViewer url={pdfUrl} filename={doc.title} restrictDownload={doc.restrictDownload} />
                ) : (
                  <Card>
                    <CardContent className="flex flex-row items-center gap-3 py-12 justify-center text-zinc-400 p-5">
                      <Clock size={18} className="animate-pulse" />
                      <span className="text-sm">PDF is being processed…</span>
                    </CardContent>
                  </Card>
                )
              ) : showPageEditor ? (
                <div className="relative">
                  {collab.provider && collab.ydoc && !useFallbackEditor ? (
                    <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
                      <CollaborativeEditor
                        key={collab.ydoc.clientID}
                        ydoc={collab.ydoc}
                        provider={collab.provider}
                        readOnly={!canEdit}
                        documentId={docId}
                      />
                    </div>
                  ) : showFallback ? (
                    <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
                      <RichTextEditor
                        content={content}
                        onChange={setContent}
                        {...(canEdit ? { onAutoSave: handleAutoSave } : {})}
                        readOnly={!canEdit}
                        title={doc.title}
                        documentId={docId}
                      />
                    </div>
                  ) : (
                    <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
                      <div className="p-4 space-y-3">
                        <Skeleton className="w-full h-4 rounded" />
                        <Skeleton className="w-5/6 h-4 rounded" />
                        <Skeleton className="w-4/6 h-4 rounded" />
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function SaveIndicator({
  status,
  connectionStatus,
}: {
  status: SaveStatus;
  connectionStatus: "connecting" | "connected" | "disconnected";
}) {
  if (connectionStatus === "disconnected") {
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
