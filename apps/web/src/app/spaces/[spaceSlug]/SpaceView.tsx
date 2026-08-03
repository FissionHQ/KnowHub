"use client";

import React, { useRef, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { documentsApi, spacesApi } from "@/lib/api";
import type { Document, Space } from "@wiki/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FileText, Plus, File, ChevronRight } from "lucide-react";
import clsx from "clsx";
import { importDocumentFile, importPdfAsViewer, importPptxAsViewer } from "@/lib/importDocument";
import { spaceDocPath, spacePath } from "@/lib/spacePath";
import { SearchPanel } from "@/components/search/SearchPanel";
import { FileImportModal, type ImportFileKind } from "@/components/FileImportModal";
import { Pagination } from "@/components/ui/Pagination";
import { SpaceGroupAccessPanel } from "@/components/SpaceGroupAccessPanel";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/ui/ToastProvider";

const PAGE_SIZE = 10;

interface Props { spaceSlug: string }

function importKindForFile(file: File): ImportFileKind | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".pptx") || name.endsWith(".ppt")) return "pptx";
  return null;
}

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

export function SpaceView({ spaceSlug }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setImporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importModalFile, setImportModalFile] = useState<File | null>(null);

  const { data: space, isLoading: spaceLoading } = useSWR<Space>(
    `space:${spaceSlug}`,
    () => spacesApi.get(spaceSlug),
  );
  const { data: docs = [], isLoading: docsLoading } = useSWR<Document[]>(
    space ? `space:${space.slug}:docs` : null,
    () => documentsApi.listBySpace(space!.slug),
    { revalidateOnFocus: false },
  );

  async function handleImport(file: File) {
    const kind = importKindForFile(file);
    if (kind) {
      setImportModalFile(file);
      return;
    }
    if (!space) return;
    setImporting(true);
    try {
      const doc = await importDocumentFile(space.id, file);
      router.push(spaceDocPath(space, doc.slug));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to import file");
    } finally {
      setImporting(false);
    }
  }

  async function handleImportConvert() {
    if (!importModalFile || !space) return;
    const file = importModalFile;
    setImportModalFile(null);
    try {
      const doc = await importDocumentFile(space.id, file);
      router.push(spaceDocPath(space, doc.slug));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to import file");
    }
  }

  async function handleImportAttach() {
    if (!importModalFile || !space) return;
    const file = importModalFile;
    const kind = importKindForFile(file);
    setImportModalFile(null);
    try {
      const doc =
        kind === "pptx"
          ? await importPptxAsViewer(space.id, file)
          : await importPdfAsViewer(space.id, file);
      router.push(spaceDocPath(space, doc.slug));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to import file");
    }
  }

  const [searchActive, setSearchActive] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const idSet = new Set(docs.map((d) => d.id));
  const rootDocs = docs.filter((d) => !d.parentId || !idSet.has(d.parentId));
  const pagedRootDocs = rootDocs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const canEdit = space?.accessLevel === "edit";
  const canManageSpaceAccess = Boolean(
    user && space && (user.role === "admin" || space.createdBy === user.id),
  );

  async function handleDeleteSpace() {
    if (!space) return;
    if (!confirm(`Delete space "${space.name}"? This removes all documents in it.`)) return;
    setDeleting(true);
    try {
      await spacesApi.delete(space.id);
      toast(`Space "${space.name}" deleted`, "success");
      router.push("/spaces");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to delete space", "error");
    } finally {
      setDeleting(false);
    }
  }

  function getChildren(parentId: string): Document[] {
    return docs.filter((d) => d.parentId === parentId);
  }

  function renderRows(items: Document[], depth: number): React.ReactNode {
    return items.map((doc) => {
      const children = getChildren(doc.id);
      const isExpanded = expandedIds.has(doc.id);
      const href = space ? spaceDocPath(space, doc.slug) : `/spaces/${spaceSlug}/docs/${doc.slug}`;
      return (
        <div key={doc.id}>
          <div
            role="button"
            tabIndex={0}
            onClick={() => router.push(href)}
            onKeyDown={(e) => e.key === "Enter" && router.push(href)}
            className="group block cursor-pointer"
            style={{ paddingLeft: depth * 20 }}
          >
            <div className="flex items-center gap-3 px-4 py-2 rounded-lg border border-transparent hover:border-border dark:hover:border-border hover:bg-accent transition-colors">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggleExpand(doc.id); }}
                className="shrink-0 w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-muted-foreground"
                style={{ visibility: children.length > 0 ? "visible" : "hidden" }}
              >
                <ChevronRight size={12} className={clsx("transition-transform", isExpanded && "rotate-90")} />
              </button>
              <div
                className={
                  doc.type === "pdf" || doc.type === "pptx"
                    ? "p-1 rounded-md bg-red-50 dark:bg-red-950/40 text-red-500 shrink-0"
                    : "p-1 rounded-md bg-orange-50 dark:bg-orange-950/40 text-primary shrink-0"
                }
              >
                {doc.type === "pdf" || doc.type === "pptx" ? (
                  <File size={14} color="var(--primary)" />
                ) : (
                  <FileText size={14} color="var(--primary)" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground text-sm truncate group-hover:text-primary transition-colors">
                  {doc.title}
                </p>
              </div>
              <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
                {doc.ownerName ?? "Unknown"}
              </span>
              <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                {formatDateTime(doc.updatedAt)}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                {doc.tags.slice(0, 2).map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
                {doc.status === "draft" && (
                  <Badge variant="warning" className="text-xs">
                    Draft
                  </Badge>
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
            <div className="flex flex-col gap-2 flex-1">
              <Skeleton className="w-40 h-5 rounded-md" />
              <Skeleton className="w-64 h-3.5 rounded-md" />
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-foreground leading-tight">
                {space?.name ?? "Space"}
              </h1>
              {space?.description && (
                <p className="text-muted-foreground text-sm mt-0.5 truncate">{space.description}</p>
              )}
            </div>
            {canManageSpaceAccess && (
              <Button
                variant="secondary"
                size="sm"
                className="shrink-0"
                disabled={deleting}
                onClick={() => void handleDeleteSpace()}
              >
                {deleting ? "Deleting…" : "Delete space"}
              </Button>
            )}
          </>
        )}
        {canEdit && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.ppt,.pptx,.doc,.docx,.txt,.md"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImport(file);
                e.target.value = "";
              }}
            />
            {/* <Button
              variant="secondary"
              size="sm"
              className="shrink-0 flex items-center gap-1.5"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
            >
              <Upload size={14} />
              {importing ? "Importing…" : "Import"}
            </Button>
            <Link href={space ? (spacePath(space, "new") as never) : (`/spaces/${spaceSlug}/new` as never)}>
              <Button
                variant="default"
                size="sm"
                className="shrink-0 flex items-center gap-1.5 bg-primary text-white hover:bg-[#e0470f] active:bg-[#cf400d] transition-colors duration-200"
              >
                <Plus size={14} />
                New Page
              </Button>
            </Link> */}
          </>
        )}
      </div>

      <Separator className="mb-6" />

      {canManageSpaceAccess && space && (
        <SpaceGroupAccessPanel space={space} />
      )}

      {/* Document count */}
      {!docsLoading && docs.length > 0 && (
        <p className="text-xs text-muted-foreground mb-3">{docs.length} document{docs.length !== 1 ? "s" : ""}</p>
      )}

      <div className="mb-6">
        {space?.id ? (
          <SearchPanel
            lockedSpaceId={space.id}
            placeholder="Search in this space…"
            onSearchedChange={setSearchActive}
          />
        ) : (
          <SearchPanel
            placeholder="Search in this space…"
            onSearchedChange={setSearchActive}
          />
        )}
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
          <CardContent className="py-16 flex flex-col items-center gap-3 text-muted-foreground p-5">
            <FileText size={40} className="opacity-30" />
            <p className="text-sm">
              {canEdit ? "No documents yet. Create the first page." : "No documents in this space yet."}
            </p>
            {canEdit && space && (
              <Link href={spacePath(space, "new") as never}>
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
            {renderRows(pagedRootDocs, 0)}
            <Pagination
              page={page}
              totalPages={Math.ceil(rootDocs.length / PAGE_SIZE)}
              total={rootDocs.length}
              pageSize={PAGE_SIZE}
              onChange={(p) => { setPage(p); setExpandedIds(new Set()); }}
              label="documents"
            />
          </div>
      )}
        </>
      )}

      {importModalFile && typeof window !== "undefined" && (
        <FileImportModal
          kind={importKindForFile(importModalFile) ?? "pdf"}
          fileName={importModalFile.name}
          onConvert={() => { void handleImportConvert(); }}
          onAttach={() => { void handleImportAttach(); }}
          onCancel={() => setImportModalFile(null)}
        />
      )}
    </div>
  );
}
