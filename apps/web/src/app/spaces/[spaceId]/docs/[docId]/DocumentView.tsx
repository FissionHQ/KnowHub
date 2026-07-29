"use client";

import useSWR, { mutate as globalMutate } from "swr";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { documentsApi, attachmentsApi, spacesApi, commentsApi, activityApi } from "@/lib/api";
import type { Document, Space, Comment } from "@wiki/types";
import { DocumentPermissionsPanel } from "@/components/DocumentPermissionsPanel";
import { TrashConfirmDialog } from "@/components/TrashConfirmDialog";
import { DocumentVersionHistory } from "@/components/DocumentVersionHistory";
import { CollaborativeEditor } from "@/components/editor/CollaborativeEditor";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { CommentsPanel } from "@/components/editor/CommentsPanel";
import { useCollaboration } from "@/hooks/useCollaboration";
import { ydocToHtml } from "@wiki/doc-collab";
import { formatPresenceLabel } from "@/lib/collab";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
  History,
  Shield,
  Tag,
  X,
  Plus,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const PdfViewer = dynamic(
  () => import("@/components/pdf/PdfViewer").then((m) => ({ default: m.PdfViewer })),
  { ssr: false },
);

type SaveStatus = "saved" | "saving" | "unsaved";

/** Attachment-backed PDFs have no HTML body; imported PDFs store converted HTML. */
function isPdfViewerDoc(doc: Pick<Document, "type" | "contentRef" | "editableContentRef">): boolean {
  const body = doc.editableContentRef ?? doc.contentRef;
  return doc.type === "pdf" && !body;
}

function isEditableDoc(doc: Pick<Document, "type" | "contentRef" | "editableContentRef">): boolean {
  const body = doc.editableContentRef ?? doc.contentRef;
  return doc.type === "page" || (doc.type === "pdf" && Boolean(body));
}

function editorTitle(doc: Document): string {
  return doc.editableTitle ?? doc.title;
}

function editorContent(doc: Document): string {
  return doc.editableContentRef ?? doc.contentRef ?? "";
}

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
  const titleFocused = useRef(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const loadedDocId = useRef<string | null>(null);
  const prevCollabSaveStatus = useRef<SaveStatus>("saved");
  const [discarding, setDiscarding] = useState(false);
  /** Optimistic draft UI — Discard always resets collab + reloads, so this is safe. */
  const [localDraft, setLocalDraft] = useState(false);
  const suppressDraftBanner = useRef(false);

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

  const canEdit = Boolean(user && (user.role === "admin" || doc?.accessLevel === "edit"));

  const collab = useCollaboration({
    orgId: user?.orgId ?? doc?.orgId ?? "",
    documentId: docId,
    userId: user?.id ?? "",
    userName: user?.name ?? "You",
    canEdit,
    // Viewers must not join the shared draft room — they see published HTML only.
    enabled: Boolean(user && doc && isEditableDoc(doc) && canEdit && !useFallbackEditor),
  });

  useEffect(() => {
    if (!doc) return;
    if (loadedDocId.current === doc.id) return;
    loadedDocId.current = doc.id;
    setContent(editorContent(doc));
    setTitle(editorTitle(doc));
    setUseFallbackEditor(false);
    suppressDraftBanner.current = false;
    setLocalDraft(Boolean(doc.hasUnpublishedChanges));
  }, [doc]);

  useEffect(() => {
    if (doc?.hasUnpublishedChanges) setLocalDraft(true);
  }, [doc?.hasUnpublishedChanges]);

  // Sync title from external changes (e.g. sidebar rename) when input is not focused
  useEffect(() => {
    if (!doc) return;
    if (titleFocused.current) return;
    setTitle(editorTitle(doc));
  }, [doc?.editableTitle, doc?.title]);

  useEffect(() => {
    activityApi.recordView(docId).catch(() => {});
  }, [docId]);

  // If collab never reaches "connected" (port conflict, auth failure, etc.),
  // drop to the REST editor so contentRef still renders.
  useEffect(() => {
    if (!doc || !isEditableDoc(doc) || useFallbackEditor) return;
    if (collab.status === "connected") return;

    const timer = setTimeout(() => {
      setUseFallbackEditor((prev) => {
        if (prev) return prev;
        // Capture may be stale; falling back when still not connected is safe.
        return true;
      });
    }, 4000);

    return () => clearTimeout(timer);
  }, [doc?.id, doc?.type, useFallbackEditor, collab.status]);

  useEffect(() => {
    if (useFallbackEditor || suppressDraftBanner.current) return;

    const prev = prevCollabSaveStatus.current;
    prevCollabSaveStatus.current = collab.saveStatus;
    let followUp: ReturnType<typeof setTimeout> | undefined;

    // Banner early; Discard stays hidden until the server has a real draft.
    if (collab.saveStatus === "saving" && doc?.status === "published") {
      setLocalDraft(true);
    }

    // Refetch after persist window so Discard can appear — never clear the banner here
    // (persist races with "saved" and was wiping the optimistic flag).
    if (prev === "saving" && collab.saveStatus === "saved") {
      void mutate();
      // Second pass after collab debounce write lands in DB.
      followUp = setTimeout(() => {
        if (!suppressDraftBanner.current) void mutate();
      }, 1500);
    }

    return () => {
      if (followUp) clearTimeout(followUp);
    };
  }, [collab.saveStatus, useFallbackEditor, docId, mutate, doc?.status]);

  const loadPdfUrl = useCallback(async () => {
    if (!doc?.id) return;
    const items = await attachmentsApi.listByDocument(doc.id).catch(() => []);
    const att = items[0];
    if (!att) return;
    if (att.ready) {
      setPdfUrl(attachmentsApi.viewProxyUrl(att.attachmentId));
    }
  }, [doc?.id]);

  useEffect(() => {
    if (!doc || !isPdfViewerDoc(doc) || pdfUrl) return;

    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      await loadPdfUrl();
    };

    void poll();
    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [doc?.type, doc?.id, pdfUrl, loadPdfUrl]);

  const handleAutoSave = useCallback(
    async (html: string) => {
      if (!doc) return;
      if (doc.status === "published" && !suppressDraftBanner.current) {
        setLocalDraft(true);
      }
      setSaveStatus("saving");
      try {
        const updated = await documentsApi.update(docId, { content: html });
        setSaveStatus("saved");
        mutate(updated, false);
        // Keep banner while saving; only drop if server confirms no draft.
        if (updated.hasUnpublishedChanges) setLocalDraft(true);
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
      <div className="p-8 max-w-8xl mx-auto space-y-4">
        <Skeleton className="w-1/3 h-4 rounded-md" />
        <Skeleton className="w-2/3 h-8 rounded-xl" />
        <Skeleton className="w-full h-96 rounded-xl" />
      </div>
    );
  }

  const currentDoc = doc;
  const showPageEditor = isEditableDoc(currentDoc) && Boolean(user) && canEdit;
  const showPublishedReadonly = isEditableDoc(currentDoc) && Boolean(user) && !canEdit;
  const showFallback = showPageEditor && (useFallbackEditor || (!collab.provider && !authLoading && !collab.status.startsWith("connect")));
  const activeSaveStatus = showFallback ? saveStatus : collab.saveStatus;
  // Fallback editor is always "online". For collab, only treat a true disconnect as
  // reconnecting — initial "connecting" should not flash the amber warning.
  const connectionStatus = showFallback ? "connected" : collab.status;

  function getPublishPayload(): { title: string; content?: string } {
    const trimmedTitle = title.trim() || editorTitle(currentDoc);
    if (showFallback) {
      return { title: trimmedTitle, content };
    }
    if (collab.provider && collab.ydoc) {
      try {
        return { title: trimmedTitle, content: ydocToHtml(collab.ydoc) };
      } catch {
        return { title: trimmedTitle };
      }
    }
    return { title: trimmedTitle };
  }

  async function handleTitleBlur() {
    if (!canEdit) return;
    const trimmed = title.trim();
    if (!trimmed || trimmed === editorTitle(currentDoc)) return;
    if (currentDoc.status === "published") setLocalDraft(true);
    setSaveStatus("saving");
    try {
      const updated = await documentsApi.update(docId, { title: trimmed });
      mutate(updated, false);
      if (updated.hasUnpublishedChanges) setLocalDraft(true);
      void globalMutate(`space:${spaceId}:docs`);
      void globalMutate("favorites");
      void globalMutate("recently-updated");
      setSaveStatus("saved");
    } catch {
      setSaveStatus("unsaved");
    }
  }

  async function handleDiscardDraft() {
    // Only when the server has a draft — button is hidden until then.
    if (!currentDoc.hasUnpublishedChanges || discarding) return;
    suppressDraftBanner.current = true;
    setLocalDraft(false);
    setDiscarding(true);
    try {
      const result = await documentsApi.discardDraft(docId);
      mutate(result.document, false);
      setTitle(result.document.title);
      window.setTimeout(() => window.location.reload(), 400);
    } catch {
      suppressDraftBanner.current = false;
      setDiscarding(false);
      setLocalDraft(true);
    }
  }

  const showDraftBanner =
    canEdit &&
    currentDoc.status === "published" &&
    (Boolean(currentDoc.hasUnpublishedChanges) || localDraft);

  const canDiscardDraft = Boolean(currentDoc.hasUnpublishedChanges);

  return (
    <div className="p-8 max-w-8xl mx-auto">
      <div>
        <nav
          aria-label="Breadcrumb"
          className="text-xs text-muted-foreground mb-5 flex items-center gap-1.5 flex-wrap"
        >
          <Link
            href="/spaces"
            className="hover:text-primary dark:hover:text-primary transition-colors"
          >
            Spaces
          </Link>
          <span aria-hidden="true">/</span>
          <Link
            href={`/spaces/${spaceId}`}
            className="text-muted-foreground hover:text-primary dark:hover:text-primary transition-colors truncate max-w-[160px]"
          >
            {space?.name ?? "Space"}
          </Link>
          <span aria-hidden="true">/</span>
          {parentDoc && (
            <>
              <Link
                href={`/spaces/${spaceId}/docs/${parentDoc.id}`}
                className="text-muted-foreground hover:text-primary dark:hover:text-primary transition-colors truncate max-w-[160px]"
              >
                {parentDoc.title}
              </Link>
              <span aria-hidden="true">/</span>
            </>
          )}
          <span className="text-foreground/80 font-medium truncate max-w-[240px]">
            {canEdit ? title || doc.title : doc.title}
          </span>
        </nav>

        {showDraftBanner && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
            <span className="flex items-center gap-2 min-w-0">
              <PenLine size={14} className="shrink-0" />
              <span className="truncate">
                Unpublished changes — readers still see the published version until you publish.
                  
              </span>
            </span>
            {canDiscardDraft && (
              <button
                type="button"
                disabled={discarding}
                onClick={() => void handleDiscardDraft()}
                className="shrink-0 text-xs font-medium underline-offset-2 hover:underline disabled:opacity-50"
              >
                {discarding ? "Discarding…" : "Discard"}
              </button>
            )}
          </div>
        )}

        <div className="flex items-start justify-between gap-4 mb-1 flex-wrap">
          {canEdit ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onFocus={() => { titleFocused.current = true; }}
              onBlur={() => { titleFocused.current = false; handleTitleBlur(); }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              className="text-3xl font-bold text-foreground flex-1 leading-tight bg-transparent border-none outline-none focus:ring-0 placeholder:text-muted-foreground dark:placeholder:text-muted-foreground w-full min-w-0"
              placeholder="Untitled"
            />
          ) : (
            <h1 className="text-3xl font-bold text-foreground flex-1 leading-tight">
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
                  void globalMutate("favorites");
                }}
                title={isFavorited ? "Remove from bookmarks" : "Bookmark this page"}
                className={`inline-flex items-center justify-center w-7 h-7 rounded-lg transition-colors ${
                  isFavorited
                    ? "text-amber-500"
                    : "text-muted-foreground hover:text-amber-500"
                }`}
              >
                <Star size={15} className={isFavorited ? "fill-amber-500" : ""} />
              </button>
            )}
            {isEditableDoc(doc) && user && canEdit && (
              <SaveIndicator status={activeSaveStatus} connectionStatus={connectionStatus} />
            )}
            {canEdit && (
              <DocumentActionsMenu
                doc={doc}
                deleting={deleting}
                getPublishPayload={getPublishPayload}
                onUpdate={(updated, opts) => {
                  mutate(updated, false);
                  if (opts?.published) {
                    setLocalDraft(false);
                    void globalMutate(`doc-versions:${docId}`);
                  }
                }}
                onMoveToTrash={handleMoveToTrash}
                onOpenVersions={() => setVersionsOpen(true)}
              />
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 mb-1 flex-wrap">
          <span className="text-xs text-muted-foreground">
            {doc.lastEditedByName ?? doc.ownerName ?? "Someone"} updated {formatRelativeTime(doc.updatedAt)}
          </span>
          {doc.tags.length > 0 && (
            <>
              <span className="text-border">·</span>
              {doc.tags.map((tag) => (
                <span key={tag} className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-md">
                  {tag}
                </span>
              ))}
            </>
          )}
          <span className="text-border">·</span>
          <button
            type="button"
            onClick={() => setCommentsOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary dark:hover:text-primary transition-colors"
          >
            <MessageSquare size={12} />
            <span>Comments</span>
            {commentCount > 0 && (
              <span className="bg-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                {commentCount}
              </span>
            )}
          </button>
          {(user?.role === "admin" || doc.ownerId === user?.id) && (
            <button
              type="button"
              onClick={() => setPermissionsOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary dark:hover:text-primary transition-colors"
            >
              <Shield size={12} />
              <span>Permissions</span>
            </button>
          )}
          {isEditableDoc(doc) && user && canEdit && (
            <EditorCountInline presence={collab.presence} status={collab.status} canEdit={canEdit} />
          )}
        </div>

        {isPdfViewerDoc(doc) ? (
          pdfUrl ? (
            <PdfViewer
              url={pdfUrl}
              filename={doc.title}
              restrictDownload={doc.restrictDownload}
            />
          ) : (
            <Card>
              <CardContent className="flex flex-row items-center gap-3 py-12 justify-center text-muted-foreground p-5">
                <Clock size={18} className="animate-pulse" />
                <span className="text-sm">PDF is being processed…</span>
              </CardContent>
            </Card>
          )
        ) : showPageEditor ? (
          <div className="relative">
            {collab.provider && collab.ydoc && !useFallbackEditor ? (
              <CollaborativeEditor
                  key={collab.ydoc.clientID}
                  ydoc={collab.ydoc}
                  provider={collab.provider}
                  readOnly={!canEdit}
                  documentId={docId}
                />
            ) : showFallback ? (
              <RichTextEditor
                  content={content}
                  onChange={setContent}
                  {...(canEdit ? { onAutoSave: handleAutoSave } : {})}
                  readOnly={!canEdit}
                  title={editorTitle(doc)}
                  documentId={docId}
                />
            ) : null}
          </div>
        ) : showPublishedReadonly ? (
          <RichTextEditor
            content={doc.contentRef ?? ""}
            onChange={() => {}}
            readOnly
            title={doc.title}
            documentId={docId}
          />
        ) : null}
      </div>

      {commentsOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setCommentsOpen(false)} />
      )}
      <div
        className={`fixed top-0 right-0 h-full w-[30%] min-w-[380px] z-50 flex flex-col bg-card border-l border-border shadow-2xl transition-transform duration-300 ease-in-out ${
          commentsOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
          <button
            type="button"
            onClick={() => setCommentsOpen(false)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground/80 dark:hover:text-sidebar-foreground hover:bg-accent transition-colors"
            title="Close comments"
          >
            <ChevronRight size={18} />
          </button>
          <div className="flex items-center gap-2">
            <MessageSquare size={15} className="text-primary" />
            <span className="font-semibold text-sm text-foreground">
              Comments
            </span>
            {commentCount > 0 && (
              <span className="bg-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                {commentCount}
              </span>
            )}
          </div>
          <span className="ml-auto text-xs text-muted-foreground truncate max-w-[160px]">
            {doc.title}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <CommentsPanel documentId={docId} defaultOpen />
        </div>
      </div>

      {permissionsOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setPermissionsOpen(false)} />
      )}
      <div
        className={`fixed top-0 right-0 h-full w-[48%] min-w-[380px] z-50 flex flex-col bg-card border-l border-border shadow-2xl transition-transform duration-300 ease-in-out ${
          permissionsOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
          <button
            type="button"
            onClick={() => setPermissionsOpen(false)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground/80 dark:hover:text-sidebar-foreground hover:bg-accent transition-colors"
            title="Close permissions"
          >
            <ChevronRight size={18} />
          </button>
          <div className="flex items-center gap-2">
            <Shield size={15} className="text-primary" />
            <span className="font-semibold text-sm text-foreground">
              Permissions
            </span>
          </div>
          <span className="ml-auto text-xs text-muted-foreground truncate max-w-[160px]">
            {doc.title}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <DocumentPermissionsPanel documentId={docId} />
        </div>
      </div>
      {versionsOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setVersionsOpen(false)} />
      )}
      <div
        className={`fixed top-0 right-0 h-full w-[30%] min-w-[320px] z-50 flex flex-col bg-card border-l border-border shadow-2xl transition-transform duration-300 ease-in-out ${
          versionsOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
          <button
            type="button"
            onClick={() => setVersionsOpen(false)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground/80 dark:hover:text-sidebar-foreground hover:bg-accent transition-colors"
          >
            <ChevronRight size={18} />
          </button>
          <div className="flex items-center gap-2">
            <History size={15} className="text-primary" />
            <span className="font-semibold text-sm text-foreground">Version history</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <DocumentVersionHistory
            documentId={docId}
            currentVersion={doc.version}
            canEdit={canEdit}
            defaultOpen
          />
        </div>
      </div>
    </div>
  );
}

function formatRelativeTime(dateStr: string | Date): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

function DocumentActionsMenu({
  doc,
  deleting,
  getPublishPayload,
  onUpdate,
  onMoveToTrash,
  onOpenVersions,
}: {
  doc: Document;
  deleting: boolean;
  getPublishPayload?: () => { title: string; content?: string };
  onUpdate: (updated: Document, opts?: { published?: boolean }) => void;
  onMoveToTrash: () => void | Promise<void>;
  onOpenVersions: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [trashConfirmOpen, setTrashConfirmOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [savingTag, setSavingTag] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

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

  async function addTag() {
    const tag = tagInput.trim();
    if (!tag || doc.tags.includes(tag)) { setTagInput(""); return; }
    setSavingTag(true);
    try {
      const updated = await documentsApi.update(doc.id, { tags: [...doc.tags, tag] });
      onUpdate(updated);
      setTagInput("");
    } finally {
      setSavingTag(false);
    }
  }

  async function removeTag(tag: string) {
    setSavingTag(true);
    try {
      const updated = await documentsApi.update(doc.id, { tags: doc.tags.filter((t) => t !== tag) });
      onUpdate(updated);
    } finally {
      setSavingTag(false);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    setOpen(false);
    try {
      const payload = getPublishPayload?.();
      const updated = await documentsApi.update(doc.id, {
        publish: true,
        status: "published",
        ...(payload
          ? {
              title: payload.title,
              ...(payload.content !== undefined ? { content: payload.content } : {}),
            }
          : {}),
      });
      onUpdate(updated, { published: true });
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
          setMenuPos({ top: rect.bottom + 4, left: rect.right - 220 });
          setOpen((v) => !v);
        }}
        title="More options"
        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground/80 dark:hover:text-sidebar-foreground hover:bg-accent transition-colors"
      >
        <MoreVertical size={16} />
      </button>

      {open &&
        typeof window !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            style={{ top: menuPos.top, left: menuPos.left }}
            className="fixed z-[9999] w-56 bg-card border border-border rounded-lg shadow-lg py-1 text-[13px]"
          >
            <button
              type="button"
              disabled={publishing}
              onClick={handlePublish}
              className="w-full text-left px-3 py-2 text-foreground/80 hover:bg-muted dark:hover:bg-accent transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <Globe size={14} />
              {publishing ? "…" : "Publish"}
            </button>

            <div className="border-t border-border my-1" />

            <button
              type="button"
              onClick={() => { setOpen(false); onOpenVersions(); }}
              className="w-full text-left px-3 py-2 text-foreground/80 hover:bg-muted dark:hover:bg-accent transition-colors flex items-center gap-2"
            >
              <History size={14} />
              Version history
            </button>

            <div className="border-t border-border my-1" />

            {/* Tags section */}
            <div className="px-3 py-2">
              <div className="flex items-center gap-1.5 mb-2 text-muted-foreground">
                <Tag size={12} />
                <span className="text-[11px] font-semibold uppercase tracking-wider">Tags</span>
              </div>
              <div className="flex flex-wrap gap-1 mb-2">
                {doc.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 text-xs bg-muted text-foreground/80 px-2 py-0.5 rounded-md"
                  >
                    {tag}
                    <button type="button" onClick={() => removeTag(tag)} disabled={savingTag} className="hover:text-red-500">
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTag()}
                  placeholder="Add tag…"
                  className="flex-1 text-xs border border-border rounded-md px-2 py-1 bg-transparent outline-none focus:border-primary text-foreground"
                />
                <button
                  type="button"
                  onClick={addTag}
                  disabled={savingTag || !tagInput.trim()}
                  className="text-primary hover:text-[#e0470f] disabled:opacity-40"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            <div className="border-t border-border my-1" />

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

function EditorCountInline({
  presence,
  status,
  canEdit,
}: {
  presence: { editors: number; viewers: number };
  status: "connecting" | "connected" | "disconnected";
  canEdit: boolean;
}) {
  const label = formatPresenceLabel(presence, status, canEdit);

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full ${
        status === "disconnected"
          ? "text-amber-600 bg-amber-50 dark:bg-amber-950/30"
          : "text-muted-foreground bg-muted"
      }`}
    >
      <Users size={12} />
      {label}
    </span>
  );
}

function SaveIndicator({
  status,
  connectionStatus,
}: {
  status: SaveStatus;
  connectionStatus: "connecting" | "connected" | "disconnected";
}) {
  // Only warn after a real drop. Initial handshake used to look "online" — keep that.
  if (connectionStatus === "disconnected") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full shrink-0">
        <AlertCircle size={11} />
        Reconnecting…
      </span>
    );
  }
  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-background dark:bg-muted px-2.5 py-1 rounded-full animate-pulse shrink-0">
        Saving…
      </span>
    );
  }
  if (status === "unsaved") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full shrink-0">
        <AlertCircle size={11} />
        Unsaved
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-emerald-600 rounded-full shrink-0">
      <CheckCircle2 size={13} />
    </span>
  );
}
