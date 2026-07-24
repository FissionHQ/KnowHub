"use client";

import React, { useRef, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { documentsApi, spacesApi } from "@/lib/api";
import type { Document, Space } from "@wiki/types";
import { Button, Chip, Card, CardContent, Skeleton, Separator } from "@heroui/react";
import { FileText, Plus, File, ChevronRight, Upload } from "lucide-react";
import clsx from "clsx";
import { importDocumentFile } from "@/lib/importDocument";
import { SearchPanel } from "@/components/search/SearchPanel";

interface Props { spaceId: string }

function formatDateTime(date: Date) {
  const d = new Date(date);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }) + " · " + d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SpaceView({ spaceId }: Props) {
  const router = useRouter();
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleImport(file: File) {
    setImporting(true);
    try {
      const doc = await importDocumentFile(spaceId, file);
      router.push(`/spaces/${spaceId}/docs/${doc.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to import file");
    } finally {
      setImporting(false);
    }
  }

  const [searchActive, setSearchActive] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const { data: space, isLoading: spaceLoading } = useSWR<Space>(
    `space:${spaceId}`,
    () => spacesApi.get(spaceId),
  );
  const { data: docs = [], isLoading: docsLoading } = useSWR<Document[]>(
    `space:${spaceId}:docs`,
    () => documentsApi.listBySpace(spaceId),
    { revalidateOnFocus: false },
  );

  const idSet = new Set(docs.map((d) => d.id));
  const rootDocs = docs.filter((d) => !d.parentId || !idSet.has(d.parentId));
  const canEdit = space?.accessLevel === "edit";

  function getChildren(parentId: string): Document[] {
    return docs.filter((d) => d.parentId === parentId);
  }

  function renderRows(items: Document[], depth: number): React.ReactNode {
    return items.map((doc) => {
      const children = getChildren(doc.id);
      const isExpanded = expandedIds.has(doc.id);
      return (
        <div key={doc.id}>
          <div
            role="button"
            tabIndex={0}
            onClick={() => router.push(`/spaces/${spaceId}/docs/${doc.id}`)}
            onKeyDown={(e) => e.key === "Enter" && router.push(`/spaces/${spaceId}/docs/${doc.id}`)}
            className="group block cursor-pointer"
            style={{ paddingLeft: depth * 20 }}
          >
            <div className="flex items-center gap-3 px-4 py-2 rounded-lg border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggleExpand(doc.id); }}
                className="shrink-0 w-4 h-4 flex items-center justify-center text-zinc-400 hover:text-zinc-600"
              >
                {children.length > 0 ? (
                  <ChevronRight size={12} className={clsx("transition-transform", isExpanded && "rotate-90")} />
                ) : (
                  <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-600 block" />
                )}
              </button>
              <div
                className={
                  doc.type === "pdf"
                    ? "p-1 rounded-md bg-red-50 dark:bg-red-950/40 text-red-500 shrink-0"
                    : "p-1 rounded-md bg-orange-50 dark:bg-orange-950/40 text-[#f25011] shrink-0"
                }
              >
                {doc.type === "pdf" ? <File size={14} color="#f25011" /> : <FileText size={14} color="#f25011" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-zinc-900 dark:text-zinc-100 text-sm truncate group-hover:text-[#f25011] transition-colors">
                  {doc.title}
                </p>
              </div>
              <span className="text-xs text-zinc-400 dark:text-zinc-500 shrink-0 hidden sm:inline">
                {doc.ownerName ?? "Unknown"}
              </span>
              <span className="text-xs text-zinc-400 dark:text-zinc-500 shrink-0 whitespace-nowrap">
                {formatDateTime(doc.updatedAt)}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                {doc.tags.slice(0, 2).map((tag) => (
                  <Chip key={tag} size="sm" variant="secondary" className="text-xs">
                    {tag}
                  </Chip>
                ))}
                {doc.status === "draft" && (
                  <Chip size="sm" color="warning" variant="soft" className="text-xs">
                    Draft
                  </Chip>
                )}
              </div>
            </div>
          </div>
          {isExpanded && children.length > 0 && renderRows(children, depth + 1)}
        </div>
      );
    });
  }


  return (
    <div className="p-8 max-w-8xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        {spaceLoading ? (
          <>
            <Skeleton className="w-12 h-12 rounded-xl" />
            <div className="flex flex-col gap-2 flex-1">
              <Skeleton className="w-40 h-5 rounded-md" />
              <Skeleton className="w-64 h-3.5 rounded-md" />
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-2xl shrink-0">
              {space?.iconEmoji ?? "📄"}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 leading-tight">
                {space?.name ?? "Space"}
              </h1>
              {space?.description && (
                <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-0.5 truncate">{space.description}</p>
              )}
            </div>
          </>
        )}
        {canEdit && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt,.md"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImport(file);
                e.target.value = "";
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              className="shrink-0 flex items-center gap-1.5"
              onPress={() => fileInputRef.current?.click()}
              isDisabled={importing}
            >
              <Upload size={14} />
              {importing ? "Importing…" : "Import"}
            </Button>
            <Link href={`/spaces/${spaceId}/new` as never}>
              <Button
                variant="primary"
                size="sm"
                className="shrink-0 flex items-center gap-1.5 bg-[#f25011] text-white hover:bg-[#e0470f] active:bg-[#cf400d] transition-colors duration-200"
              >
                <Plus size={14} />
                New Page
              </Button>
            </Link>
          </>
        )}
      </div>

      <Separator className="mb-6" />
      {/* Document count */}
      {!docsLoading && docs.length > 0 && (
        <p className="text-xs text-zinc-400 mb-3">{docs.length} document{docs.length !== 1 ? "s" : ""}</p>
      )}

      <div className="mb-6">
        <SearchPanel
          lockedSpaceId={spaceId}
          placeholder="Search in this space…"
          onSearchedChange={setSearchActive}
        />
      </div>

      {!searchActive && (
        <>
      {/* Document list */}
      {docsLoading ? (
        <div className="flex flex-col gap-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="w-full h-10 rounded-lg" />
          ))}
        </div>
      ) : docs.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-3 text-zinc-400 dark:text-zinc-500 p-5">
            <FileText size={40} className="opacity-30" />
            <p className="text-sm">
              {canEdit ? "No documents yet. Create the first page." : "No documents in this space yet."}
            </p>
            {canEdit && (
              <Link href={`/spaces/${spaceId}/new` as never}>
                <Button variant="secondary" size="sm" className="flex items-center gap-1.5 mt-1">
                  <Plus size={14} />
                  New Page
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
          <div className="flex flex-col gap-0.5">
            {renderRows(rootDocs, 0)}
          </div>
      )}
        </>
      )}

    </div>
  );
}
