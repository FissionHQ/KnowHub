"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DocumentListItem } from "@wiki/types";
import { useAuth } from "@/lib/auth";
import { Skeleton } from "@heroui/react";
import { FileText, Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@heroui/react";
import { DocumentRow } from "./DocumentRow";
import { DocumentTableToolbar } from "./DocumentTableToolbar";
import { useDocumentDrawer } from "./DocumentDrawerContext";
import { filterAndSortDocuments } from "./types";
import type { DocumentTableState } from "./types";

interface Props {
  spaceId: string;
  documents: DocumentListItem[];
  isLoading: boolean;
  onRefresh: () => void;
  isRefreshing?: boolean;
  onUploadPdf: () => void;
  onImportDocx: () => void;
}

export function DocumentTable({
  spaceId,
  documents,
  isLoading,
  onRefresh,
  isRefreshing,
  onUploadPdf,
  onImportDocx,
}: Props) {
  const { user } = useAuth();
  const { selectedId, openDocument, isOpen } = useDocumentDrawer();
  const [tableState, setTableState] = useState<DocumentTableState>({
    view: "recent",
    search: "",
    sortKey: "updatedAt",
    sortAsc: false,
  });
  const [focusedIndex, setFocusedIndex] = useState(0);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  const filteredDocs = useMemo(
    () => filterAndSortDocuments(documents, tableState, user?.id),
    [documents, tableState, user?.id],
  );

  const groupedByCategory = useMemo(() => {
    if (tableState.view !== "categories") return null;
    const groups = new Map<string, DocumentListItem[]>();
    for (const doc of filteredDocs) {
      const cat = doc.tags[0] ?? "General";
      const list = groups.get(cat) ?? [];
      list.push(doc);
      groups.set(cat, list);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filteredDocs, tableState.view]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!filteredDocs.length) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((i) => Math.min(i + 1, filteredDocs.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const doc = filteredDocs[focusedIndex];
        if (doc) openDocument(doc);
      } else if (e.key === "Escape" && isOpen) {
        e.preventDefault();
      }
    },
    [filteredDocs, focusedIndex, openDocument, isOpen],
  );

  useEffect(() => {
    rowRefs.current[focusedIndex]?.focus();
  }, [focusedIndex]);

  useEffect(() => {
    setFocusedIndex(0);
  }, [filteredDocs.length, tableState.view, tableState.search]);

  const patchState = (patch: Partial<DocumentTableState>) =>
    setTableState((s) => ({ ...s, ...patch }));

  const renderRows = (docs: DocumentListItem[], offset = 0) =>
    docs.map((doc, index) => {
      const absoluteIndex = offset + index;
      return (
        <DocumentRow
          key={doc.id}
          doc={doc}
          isSelected={selectedId === doc.id}
          isFocused={focusedIndex === absoluteIndex}
          onSelect={() => openDocument(doc)}
          onFocus={() => setFocusedIndex(absoluteIndex)}
          rowRef={(el) => {
            rowRefs.current[absoluteIndex] = el;
          }}
        />
      );
    });

  return (
    <div className="flex flex-col h-full min-h-0">
      <DocumentTableToolbar
          spaceId={spaceId}
          state={tableState}
          onStateChange={patchState}
          onRefresh={onRefresh}
          {...(isRefreshing !== undefined ? { isRefreshing } : {})}
          onUploadPdf={onUploadPdf}
          onImportDocx={onImportDocx}
        />

        <div
          ref={listRef}
          role="grid"
          aria-label="Documents"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          className="flex-1 overflow-y-auto min-h-0 focus:outline-none"
        >
          <div
            role="row"
            className="grid grid-cols-[minmax(0,1fr)_180px_40px_120px_100px] gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 sticky top-0 z-[1]"
          >
            <span>Name</span>
            <span className="hidden sm:block">Last modified</span>
            <span className="text-center">Owner</span>
            <span className="hidden md:block">Category</span>
            <span className="text-right">Status</span>
          </div>

          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="w-full h-11 rounded-lg" />
              ))}
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-400 gap-3">
              <FileText size={40} className="opacity-30" />
              <p className="text-sm">No documents match your filters.</p>
              <Link href={`/spaces/${spaceId}/new` as never}>
                <Button variant="secondary" size="sm" className="gap-1.5">
                  <Plus size={14} />
                  New Page
                </Button>
              </Link>
            </div>
          ) : groupedByCategory ? (
            groupedByCategory.map(([category, docs]) => (
              <div key={category}>
                <div className="px-4 py-2 text-xs font-semibold text-zinc-500 bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-100 dark:border-zinc-800">
                  {category}
                </div>
                {renderRows(docs)}
              </div>
            ))
        ) : (
          renderRows(filteredDocs)
        )}
      </div>
    </div>
  );
}
