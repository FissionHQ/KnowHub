"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import useSWR from "swr";
import { documentsApi } from "@/lib/api";
import type { Document } from "@wiki/types";
import { FileText, Plus, ChevronRight, MoreHorizontal, Trash2, PenIcon } from "lucide-react";
import clsx from "clsx";
import { TrashConfirmDialog } from "@/components/TrashConfirmDialog";

interface NodeProps {
  doc: Document;
  allDocs: Document[];
  spaceId: string;
  depth: number;
  mutate: () => void;
}

function DocNode({ doc, allDocs, spaceId, depth, mutate }: NodeProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState(true);
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
      if (pathname === `/spaces/${spaceId}/docs/${doc.id}`) {
        router.push(`/spaces/${spaceId}`);
      }
    } finally {
      setDeleting(false);
    }
  }

  async function handleRenameSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== doc.title) {
      await documentsApi.update(doc.id, { title: trimmed });
      mutate();
    }
    setRenaming(false);
  }

  const idSet = new Set(allDocs.map((d) => d.id));
  const children = allDocs.filter((d) => d.parentId === doc.id && idSet.has(d.id));
  const isActive = pathname === `/spaces/${spaceId}/docs/${doc.id}`;

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
      router.push(`/spaces/${spaceId}/docs/${created.id}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div
        className="group flex items-center gap-1 rounded-md pr-1 hover:bg-white/10 transition-colors"
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        {/* expand/collapse toggle */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 w-4 h-4 flex items-center justify-center"
        >
          {children.length > 0 ? (
            <ChevronRight
              size={11}
              className={clsx("transition-transform", expanded && "rotate-90")}
            />
          ) : (
            <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-600 block" />
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
              className="w-full text-[13px] px-1 py-0.5 rounded border border-[#f25011] outline-none bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100"
            />
          </form>
        ) : (
          <Link
            href={`/spaces/${spaceId}/docs/${doc.id}`}
            className={clsx(
              "flex-1 flex items-center gap-1.5 py-1.5 text-[13px] truncate min-w-0",
              isActive ? "font-medium" : "text-zinc-300",
            )}
            style={isActive ? { color: "#f25011" } : {}}
          >
            <FileText size={12} className="shrink-0 opacity-60" />
            <span className="truncate">{doc.title}</span>
          </Link>
        )}

        {/* + new subpage */}
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating}
          title="New sub-page"
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-[#f25011] w-5 h-5 flex items-center justify-center rounded"
        >
          <Plus size={12} />
        </button>

        {/* ⋯ context menu */}
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
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-[#f25011] w-5 h-5 flex items-center justify-center rounded"
        >
          <MoreHorizontal size={12} />
        </button>

        {menuOpen && typeof window !== "undefined" && createPortal(
          <div
            ref={menuRef}
            style={{ top: menuPos.top, left: menuPos.left }}
            className="fixed z-[9999] w-32 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg py-1 text-[13px]"
          >
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setRenameValue(doc.title); setRenaming(true); }}
              className="w-full text-left px-3 py-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <PenIcon size={10} />
              Rename
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={handleTrashClick}
              className="w-full text-left px-3 py-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors flex items-center gap-2 disabled:opacity-50"
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
              depth={depth + 1}
              mutate={mutate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  spaceId: string;
}

export function SpaceDocTree({ spaceId }: Props) {
  const router = useRouter();
  const { data: docs = [], mutate } = useSWR<Document[]>(
    `space:${spaceId}:docs`,
    () => documentsApi.listBySpace(spaceId),
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
    router.push(`/spaces/${spaceId}/docs/${created.id}`);
  }

  return (
    <div className="mt-1">
      {rootDocs.map((doc) => (
        <DocNode
          key={doc.id}
          doc={doc}
          allDocs={docs}
          spaceId={spaceId}
          depth={0}
          mutate={mutate}
        />
      ))}
      <button
        type="button"
        onClick={handleNewRootPage}
        className="flex items-center gap-1.5 px-3 py-1.5 mt-0.5 w-full text-left text-[12px] text-zinc-500 hover:text-[#f25011] hover:bg-white/10 rounded-md transition-colors"
      >
        <Plus size={11} />
        New page
      </button>
    </div>
  );
}
