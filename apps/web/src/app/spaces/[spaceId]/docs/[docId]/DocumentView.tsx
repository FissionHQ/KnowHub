"use client";

import useSWR from "swr";
import Link from "next/link";
import dynamic from "next/dynamic";
import { documentsApi, attachmentsApi, spacesApi, commentsApi, activityApi } from "@/lib/api";
import type { Document, Space, Comment } from "@wiki/types";
import { DocumentPermissionsPanel } from "@/components/DocumentPermissionsPanel";
import { DocumentVersionHistory } from "@/components/DocumentVersionHistory";
import { CollaborativeEditor } from "@/components/editor/CollaborativeEditor";
import { EditorCountBadge } from "@/components/editor/EditorCountBadge";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { CommentsPanel } from "@/components/editor/CommentsPanel";
import { PageMetadataPanel } from "@/components/editor/PageMetadataPanel";
import { useCollaboration } from "@/hooks/useCollaboration";
import { useAuth } from "@/lib/auth";
import { Chip, Skeleton, Card, CardContent, Button } from "@heroui/react";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Globe,
  PenLine,
  MessageSquare,
  ChevronRight,
  Star,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const PdfViewer = dynamic(
  () => import("@/components/pdf/PdfViewer").then((m) => ({ default: m.PdfViewer })),
  { ssr: false },
);

type SaveStatus = "saved" | "saving" | "unsaved";

interface Props {
  spaceId: string;
  docId: string;
}

export function DocumentView({ spaceId, docId }: Props) {
  const { user } = useAuth();
  const { data: doc, mutate } = useSWR<Document>(`doc:${docId}`, () => documentsApi.get(docId));
  const { data: space } = useSWR<Space>(`space:${spaceId}`, () => spacesApi.get(spaceId));
  const { data: parentDoc } = useSWR<Document>(
    doc?.parentId ? `doc:${doc.parentId}` : null,
    () => documentsApi.get(doc!.parentId!),
  );

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [useFallbackEditor, setUseFallbackEditor] = useState(false);
  const [title, setTitle] = useState("");
  const [commentsOpen, setCommentsOpen] = useState(false);
  const loadedDocId = useRef<string | null>(null);

  const { data: favData, mutate: mutateFav } = useSWR(
    doc && user ? `fav:${docId}` : null,
    () => activityApi.isFavorited(docId),
  );
  const isFavorited = favData?.favorited ?? false;

  const { data: comments = [] } = useSWR<Comment[]>(
    `comments:${docId}`,
    () => commentsApi.list(docId),
  );
  const commentCount = comments.filter((c) => !c.parentId).length;

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
    setTitle(doc.title);
  }, [doc]);

  useEffect(() => {
    if (doc) activityApi.recordView(docId).catch(() => {});
  }, [doc?.id, docId]);

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
      <div className="flex gap-6 p-8 max-w-6xl mx-auto">
        <div className="flex-1 space-y-4">
          <Skeleton className="w-1/3 h-4 rounded-md" />
          <Skeleton className="w-2/3 h-8 rounded-xl" />
          <Skeleton className="w-full h-96 rounded-xl" />
        </div>
        <div className="w-64 space-y-3 shrink-0">
          <Skeleton className="w-full h-10 rounded-xl" />
          <Skeleton className="w-full h-10 rounded-xl" />
        </div>
      </div>
    );
  }

  const currentDoc = doc;
  const showCollab = currentDoc.type === "page" && collab.provider && user && !useFallbackEditor;
  const showFallback = currentDoc.type === "page" && useFallbackEditor && user;
  const canEdit = currentDoc.accessLevel === "edit";
  const activeSaveStatus = showFallback ? saveStatus : collab.saveStatus;
  const isConnected = showFallback ? true : collab.status === "connected";

  async function handleTitleBlur() {
    if (!canEdit) return;
    const trimmed = title.trim();
    if (!trimmed || trimmed === currentDoc.title) return;
    setSaveStatus("saving");
    try {
      const updated = await documentsApi.update(docId, { title: trimmed });
      mutate(updated, false);
      setSaveStatus("saved");
    } catch {
      setSaveStatus("unsaved");
    }
  }

  return (
    <div className="flex gap-6 p-8 max-w-6xl mx-auto items-start">
      <div className="flex-1 min-w-0">
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
          {parentDoc && (
            <>
              <Link
                href={`/spaces/${spaceId}/docs/${parentDoc.id}`}
                className="text-zinc-500 dark:text-zinc-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors truncate max-w-[160px]"
              >
                {parentDoc.title}
              </Link>
              <span aria-hidden="true">/</span>
            </>
          )}
          <span className="text-zinc-700 dark:text-zinc-200 font-medium truncate max-w-[240px]">
            {doc.title}
          </span>
        </nav>

        <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
          {canEdit ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 flex-1 leading-tight bg-transparent border-none outline-none focus:ring-0 placeholder:text-zinc-300 dark:placeholder:text-zinc-600 w-full min-w-0"
              placeholder="Untitled"
            />
          ) : (
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 flex-1 leading-tight">
              {doc.title}
            </h1>
          )}

          <div className="flex flex-col items-end gap-2 shrink-0">
            {user && (
              <button
                type="button"
                onClick={async () => {
                  await activityApi.toggleFavorite(docId);
                  mutateFav();
                }}
                title={isFavorited ? "Remove from bookmarks" : "Bookmark this page"}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  isFavorited
                    ? "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-950/50"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-amber-500"
                }`}
              >
                <Star
                  size={14}
                  className={isFavorited ? "fill-amber-500 text-amber-500" : ""}
                />
                {isFavorited ? "Bookmarked" : "Bookmark"}
              </button>
            )}
            {doc.type === "page" && user && (
              <>
                {!showFallback && (
                  <EditorCountBadge count={collab.editorCount} status={collab.status} />
                )}
                <SaveIndicator status={activeSaveStatus} connected={isConnected} />
              </>
            )}
            {canEdit && (
              <PublishButton doc={doc} onUpdate={(updated) => mutate(updated, false)} />
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 mb-5 flex-wrap">
          {doc.tags.length > 0 &&
            doc.tags.map((tag) => (
              <Chip key={tag} size="sm" variant="secondary" className="text-xs">
                {tag}
              </Chip>
            ))}
          <button
            type="button"
            onClick={() => setCommentsOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 hover:text-violet-600 dark:hover:text-violet-400 bg-zinc-100 dark:bg-zinc-800 hover:bg-violet-50 dark:hover:bg-violet-950/30 px-2.5 py-1 rounded-full transition-colors"
          >
            <MessageSquare size={12} />
            <span>Comments</span>
            {commentCount > 0 && (
              <span className="bg-violet-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                {commentCount}
              </span>
            )}
          </button>
        </div>

        {(user?.role === "admin" || doc.ownerId === user?.id) && (
          <DocumentPermissionsPanel documentId={docId} />
        )}

        {doc.type === "pdf" ? (
          pdfUrl ? (
            <PdfViewer
              url={pdfUrl}
              filename={doc.title}
              restrictDownload={doc.restrictDownload}
            />
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
              title={doc.title}
              documentId={docId}
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

      <div className="w-64 shrink-0 flex flex-col sticky top-18">
        <PageMetadataPanel doc={doc} onUpdate={(updated) => mutate(updated, false)} />
        {doc.type === "page" && user && canEdit && (
          <DocumentVersionHistory
            documentId={docId}
            currentVersion={doc.version}
            canEdit
          />
        )}
      </div>

      {commentsOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setCommentsOpen(false)} />
      )}
      <div
        className={`fixed top-0 right-0 h-full w-[48%] min-w-[380px] z-50 flex flex-col bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-700 shadow-2xl transition-transform duration-300 ease-in-out ${
          commentsOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-200 dark:border-zinc-700 shrink-0">
          <button
            type="button"
            onClick={() => setCommentsOpen(false)}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            title="Close comments"
          >
            <ChevronRight size={18} />
          </button>
          <div className="flex items-center gap-2">
            <MessageSquare size={15} className="text-violet-600 dark:text-violet-400" />
            <span className="font-semibold text-sm text-zinc-800 dark:text-zinc-100">
              Comments
            </span>
            {commentCount > 0 && (
              <span className="bg-violet-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                {commentCount}
              </span>
            )}
          </div>
          <span className="ml-auto text-xs text-zinc-400 truncate max-w-[160px]">
            {doc.title}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <CommentsPanel documentId={docId} defaultOpen />
        </div>
      </div>
    </div>
  );
}

function PublishButton({
  doc,
  onUpdate,
}: {
  doc: Document;
  onUpdate: (updated: Document) => void;
}) {
  const [loading, setLoading] = useState(false);
  const isPublished = doc.status === "published";

  async function toggle() {
    setLoading(true);
    try {
      const updated = await documentsApi.update(doc.id, {
        status: isPublished ? "draft" : "published",
      });
      onUpdate(updated);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button size="sm" isDisabled={loading} onPress={toggle} variant="primary">
      {isPublished ? <PenLine size={12} /> : <Globe size={12} />}
      {loading ? "…" : isPublished ? "Unpublish" : "Publish"}
    </Button>
  );
}

function SaveIndicator({
  status,
  connected,
}: {
  status: SaveStatus;
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
