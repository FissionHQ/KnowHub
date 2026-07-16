"use client";

import useSWR from "swr";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { documentsApi, attachmentsApi, spacesApi, commentsApi, activityApi } from "@/lib/api";
import type { Document, Space, Comment } from "@wiki/types";
import { DocumentPermissionsPanel } from "@/components/DocumentPermissionsPanel";
import { DocumentVersionHistory } from "@/components/DocumentVersionHistory";
import { CollaborativeEditor } from "@/components/editor/CollaborativeEditor";
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
  Trash2,
  MoreVertical,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
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
  const [deleting, setDeleting] = useState(false);
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
    setUseFallbackEditor(false);
  }, [doc]);

  useEffect(() => {
    if (doc) activityApi.recordView(docId).catch(() => {});
  }, [doc?.id, docId]);

  useEffect(() => {
    if (doc?.type !== "page" || useFallbackEditor) return;

    const timer = setTimeout(() => {
      setUseFallbackEditor((prev) => {
        if (prev) return prev;
        if (collab.status !== "connected") return true;
        return prev;
      });
    }, 3000);

    return () => clearTimeout(timer);
  }, [doc?.id, doc?.type, useFallbackEditor, collab.status]);

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

  async function handleMoveToTrash() {
    if (!doc) return;
    setDeleting(true);
    try {
      await documentsApi.delete(docId);
      router.push(`/spaces/${spaceId}`);
    } finally {
      setDeleting(false);
    }
  }

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
  const showPageEditor = currentDoc.type === "page" && Boolean(user);
  const showCollab =
    showPageEditor &&
    !useFallbackEditor &&
    collab.status === "connected" &&
    Boolean(collab.provider);
  const showConnecting = showPageEditor && authLoading;
  const showFallback = showPageEditor && !showCollab && !showConnecting;
  const canEdit = user?.role === "admin" || currentDoc.accessLevel === "edit";
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

          <div className="flex items-center gap-2 shrink-0">
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
              <SaveIndicator status={activeSaveStatus} connected={isConnected} />
            )}
            {canEdit && (
              <DocumentActionsMenu
                doc={doc}
                deleting={deleting}
                onUpdate={(updated) => mutate(updated, false)}
                onMoveToTrash={handleMoveToTrash}
              />
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
          {doc.type === "page" && user && (
            <EditorCountInline count={collab.editorCount} status={collab.status} />
          )}
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
        ) : showCollab && collab.provider ? (
          <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
            <CollaborativeEditor
              ydoc={collab.ydoc}
              provider={collab.provider}
              readOnly={!canEdit}
              documentId={docId}
            />
          </div>
        ) : showConnecting ? (
          <Card>
            <CardContent className="flex flex-row items-center gap-3 py-12 justify-center text-zinc-400 p-5">
              <Clock size={18} className="animate-pulse" />
              <span className="text-sm">Loading…</span>
            </CardContent>
          </Card>
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
        ) : null}
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

function DocumentActionsMenu({
  doc,
  deleting,
  onUpdate,
  onMoveToTrash,
}: {
  doc: Document;
  deleting: boolean;
  onUpdate: (updated: Document) => void;
  onMoveToTrash: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [trashConfirmOpen, setTrashConfirmOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

  const isPublished = doc.status === "published";

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        !menuRef.current?.contains(e.target as Node) &&
        !btnRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    if (!trashConfirmOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !deleting) setTrashConfirmOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [trashConfirmOpen, deleting]);

  async function togglePublish() {
    setPublishing(true);
    setOpen(false);
    try {
      const updated = await documentsApi.update(doc.id, {
        status: isPublished ? "draft" : "published",
      });
      onUpdate(updated);
    } finally {
      setPublishing(false);
    }
  }

  function handleTrashClick() {
    setOpen(false);
    setTrashConfirmOpen(true);
  }

  async function confirmTrash() {
    await onMoveToTrash();
    setTrashConfirmOpen(false);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          const rect = btnRef.current!.getBoundingClientRect();
          setMenuPos({ top: rect.bottom + 4, left: rect.right - 160 });
          setOpen((v) => !v);
        }}
        title="More options"
        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
      >
        <MoreVertical size={16} />
      </button>

      {open &&
        typeof window !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            style={{ top: menuPos.top, left: menuPos.left }}
            className="fixed z-[9999] w-40 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg py-1 text-[13px]"
          >
            <button
              type="button"
              disabled={publishing}
              onClick={togglePublish}
              className="w-full text-left px-3 py-2 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {isPublished ? <PenLine size={14} /> : <Globe size={14} />}
              {publishing ? "…" : isPublished ? "Unpublish" : "Publish"}
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={handleTrashClick}
              className="w-full text-left px-3 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <Trash2 size={14} />
              Move to trash
            </button>
          </div>,
          document.body,
        )}

      {trashConfirmOpen &&
        typeof window !== "undefined" &&
        createPortal(
          <TrashConfirmDialog
            title={doc.title}
            deleting={deleting}
            onCancel={() => setTrashConfirmOpen(false)}
            onConfirm={confirmTrash}
          />,
          document.body,
        )}
    </>
  );
}

function TrashConfirmDialog({
  title,
  deleting,
  onCancel,
  onConfirm,
}: {
  title: string;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-[1px]"
        onClick={deleting ? undefined : onCancel}
        aria-hidden="true"
      />
      <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="trash-confirm-title"
          className="pointer-events-auto w-full max-w-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl"
        >
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 shrink-0">
                <Trash2 size={18} />
              </div>
              <div className="min-w-0">
                <h2
                  id="trash-confirm-title"
                  className="text-base font-semibold text-zinc-900 dark:text-zinc-100"
                >
                  Move to trash?
                </h2>
                <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">{title}</span>{" "}
                  will be moved to trash. An admin can restore it before the retention period
                  expires.
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 rounded-b-xl">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onPress={onCancel}
              isDisabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white"
              onPress={onConfirm}
              isPending={deleting}
              isDisabled={deleting}
            >
              Move to trash
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

function EditorCountInline({
  count,
  status,
}: {
  count: number;
  status: "connecting" | "connected" | "disconnected";
}) {
  const label =
    status === "connecting"
      ? "Connecting…"
      : status === "disconnected"
        ? "Offline"
        : count === 1
          ? "1 editing"
          : `${count} editing`;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${
        status === "disconnected"
          ? "text-amber-600 bg-amber-50 dark:bg-amber-950/30"
          : "text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800"
      }`}
    >
      <Users size={12} />
      {label}
    </span>
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
