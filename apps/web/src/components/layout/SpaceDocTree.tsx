"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import useSWR, { mutate as globalMutate } from "swr";
import { documentsApi } from "@/lib/api";
import type { Document } from "@wiki/types";
import { FileText, Plus, ChevronRight, MoreHorizontal, Trash2, PenIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { spaceDocPath, spacePath } from "@/lib/spacePath";
import { TrashConfirmDialog } from "@/components/TrashConfirmDialog";

const navItemIdle = "text-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground";
const navItemActive = "bg-sidebar-accent text-primary";

interface NodeProps {
  doc: Document;
  allDocs: Document[];
  spaceId: string;
  spaceSlug: string;
  depth: number;
  mutate: () => void;
  canEdit: boolean;
}

function DocNode({ doc, allDocs, spaceId, spaceSlug, depth, mutate, canEdit }: NodeProps) {
  const spaceRef = { slug: spaceSlug };
  const pathname = usePathname();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [trashConfirmOpen, setTrashConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(doc.title);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  useEffect(() => {
    if (!trashConfirmOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !deleting) setTrashConfirmOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [trashConfirmOpen, deleting]);

  function handleTrashClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);
    setTrashConfirmOpen(true);
  }

  async function confirmTrash() {
    setDeleting(true);
    try {
      await documentsApi.delete(doc.id);
      mutate();
      setTrashConfirmOpen(false);
      if (pathname === spaceDocPath(spaceRef, doc.slug)) {
        router.push(spacePath(spaceRef));
      }
    } finally {
      setDeleting(false);
    }
  }

  async function handleRenameSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== doc.title) {
      const wasActive = pathname === spaceDocPath(spaceRef, doc.slug);
      const updated = await documentsApi.update(doc.id, { title: trimmed });
      mutate();
      void globalMutate(`doc:${doc.id}`);
      void globalMutate(`doc:${doc.slug}`);
      void globalMutate(`doc:${updated.slug}`);
      void globalMutate("favorites");
      if (wasActive) {
        router.replace(spaceDocPath(spaceRef, updated.slug) as never);
      }
    }
    setRenaming(false);
  }

  const idSet = new Set(allDocs.map((d) => d.id));
  const children = allDocs.filter((d) => d.parentId === doc.id && idSet.has(d.id));
  const isActive = pathname === spaceDocPath(spaceRef, doc.slug);

  async function handleCreate(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setCreating(true);
    try {
      const created = await documentsApi.create({
        spaceId,
        parentId: doc.id,
        type: "page",
        title: "Untitled",
        content: "",
      });
      mutate();
      router.push(spaceDocPath(spaceRef, created.slug));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div
        className="group flex items-center gap-1 rounded-md pr-1 transition-colors hover:bg-white/5"
        style={{ paddingLeft: `${16 + depth * 16}px` }}
      >
        {/* expand/collapse toggle */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex h-4 w-4 shrink-0 items-center justify-center text-sidebar-muted transition-colors hover:text-sidebar-foreground"
        >
          {children.length > 0 ? (
            <ChevronRight
              size={11}
              className={cn("transition-transform", expanded && "rotate-90")}
            />
          ) : (
            <span className="block h-1 w-1 rounded-full bg-sidebar-muted" />
          )}
        </button>

        {renaming ? (
          <form onSubmit={handleRenameSubmit} className="flex-1 min-w-0 py-0.5">
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={(e) => e.key === "Escape" && setRenaming(false)}
              className="w-full text-[13px] px-1 py-0.5 rounded border border-primary outline-none bg-card text-foreground"
            />
          </form>
        ) : (
          <Link
            href={spaceDocPath(spaceRef, doc.slug)}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1.5 truncate rounded-md px-1 py-1.5 text-sm font-medium transition-colors",
              isActive ? navItemActive : navItemIdle,
            )}
          >
            <FileText size={12} className="shrink-0 opacity-60" />
            <span className="truncate">{doc.title}</span>
          </Link>
        )}

        {/* + new subpage */}
        {canEdit && (
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            title="New sub-page"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-sidebar-muted opacity-0 transition-opacity hover:text-sidebar-foreground group-hover:opacity-100"
          >
            <Plus size={12} />
          </button>
        )}

        {/* ⋯ context menu */}
        {canEdit && (
        <button
          ref={btnRef}
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const rect = btnRef.current!.getBoundingClientRect();
            setMenuPos({ top: rect.bottom + 4, left: rect.left });
            setMenuOpen((v) => !v);
          }}
          title="More options"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-sidebar-muted opacity-0 transition-opacity hover:text-sidebar-foreground group-hover:opacity-100"
        >
          <MoreHorizontal size={12} />
        </button>
        )}

        {menuOpen && typeof window !== "undefined" && createPortal(
          <div
            ref={menuRef}
            style={{ top: menuPos.top, left: menuPos.left }}
            className="fixed z-[9999] w-32 bg-card border border-border rounded-lg shadow-lg py-1 text-[13px]"
          >
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setRenameValue(doc.title); setRenaming(true); }}
              className="w-full text-left px-3 py-1.5 text-foreground/80 hover:bg-orange-50 dark:hover:bg-orange-950/40 hover:text-primary transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <PenIcon size={10} />
              Rename
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={handleTrashClick}
              className="w-full text-left px-3 py-1.5 text-foreground/80 hover:bg-orange-50 dark:hover:bg-orange-950/40 hover:text-primary transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <Trash2 size={10} />
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
      </div>

      {expanded && children.length > 0 && (
        <div>
          {children.map((child) => (
            <DocNode
              key={child.id}
              doc={child}
              allDocs={allDocs}
              spaceId={spaceId}
              spaceSlug={spaceSlug}
              depth={depth + 1}
              mutate={mutate}
              canEdit={canEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  spaceId: string;
  spaceSlug: string;
  canEdit?: boolean;
}

export function SpaceDocTree({ spaceId, spaceSlug, canEdit = false }: Props) {
  const router = useRouter();
  const { data: docs = [], mutate } = useSWR<Document[]>(
    `space:${spaceSlug}:docs`,
    () => documentsApi.listBySpace(spaceSlug),
    { revalidateOnFocus: false },
  );

  const idSet = new Set(docs.map((d) => d.id));
  const rootDocs = docs.filter((d) => !d.parentId || !idSet.has(d.parentId));

  async function handleNewRootPage() {
    const created = await documentsApi.create({
      spaceId,
      type: "page",
      title: "Untitled",
      content: "",
    });
    mutate();
    router.push(spaceDocPath({ slug: spaceSlug }, created.slug));
  }

  return (
    <div className="mt-1">
      {rootDocs.map((doc) => (
        <DocNode
          key={doc.id}
          doc={doc}
          allDocs={docs}
          spaceId={spaceId}
          spaceSlug={spaceSlug}
          depth={0}
          mutate={mutate}
          canEdit={canEdit}
        />
      ))}
      {canEdit && (
        <button
          type="button"
          onClick={handleNewRootPage}
          className="mt-0.5 flex w-full items-center gap-1.5 rounded-md py-1.5 text-left text-sm font-medium text-sidebar-muted transition-colors hover:bg-white/5 hover:text-sidebar-foreground"
          style={{ paddingLeft: "20px" }}
        >
          <Plus size={11} />
          New page
        </button>
      )}
    </div>
  );
}
