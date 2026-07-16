"use client";

import { useMemo, useRef, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { documentsApi, spacesApi } from "@/lib/api";
import type { Document, Space } from "@wiki/types";
import { Button, Chip, Card, CardContent, Skeleton, Separator } from "@heroui/react";
import { FileText, Plus, File, ChevronRight, Upload } from "lucide-react";
import { parseFileToHtml } from "@/lib/importers";
import { SearchPanel } from "@/components/search/SearchPanel";

interface Props { spaceId: string }

const PAGE_SIZE = 20;

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

interface FlatDoc {
  doc: Document;
  depth: number;
}

function flattenTree(docs: Document[]): FlatDoc[] {
  const childrenMap = new Map<string | undefined, Document[]>();
  for (const doc of docs) {
    const key = doc.parentId ?? "__root__";
    if (!childrenMap.has(key)) childrenMap.set(key, []);
    childrenMap.get(key)!.push(doc);
  }

  const result: FlatDoc[] = [];
  function walk(parentId: string | undefined, depth: number) {
    const key = parentId ?? "__root__";
    const children = childrenMap.get(key) ?? [];
    for (const doc of children) {
      result.push({ doc, depth });
      walk(doc.id, depth + 1);
    }
  }
  walk(undefined, 0);
  return result;
}

export function SpaceView({ spaceId }: Props) {
  const router = useRouter();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleImport(file: File) {
    setImporting(true);
    try {
      const html = await parseFileToHtml(file);
      const title = file.name.replace(/\.[^.]+$/, "");
      const doc = await documentsApi.create({ spaceId, type: "page", title, content: html });
      router.push(`/spaces/${spaceId}/docs/${doc.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to import file");
    } finally {
      setImporting(false);
    }
  }

  const [searchActive, setSearchActive] = useState(false);

  const { data: space, isLoading: spaceLoading } = useSWR<Space>(
    `space:${spaceId}`,
    () => spacesApi.get(spaceId),
  );
  const { data: docs = [], isLoading: docsLoading } = useSWR<Document[]>(
    `space:${spaceId}:docs`,
    () => documentsApi.listBySpace(spaceId),
  );

  const flatDocs = useMemo(() => flattenTree(docs), [docs]);
  const visible = flatDocs.slice(0, visibleCount);
  const hasMore = visibleCount < flatDocs.length;
  const remaining = flatDocs.length - visibleCount;

  return (
    <div className="p-8 max-w-4xl mx-auto">
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
            <p className="text-sm">No documents yet. Create the first page.</p>
            <Link href={`/spaces/${spaceId}/new` as never}>
              <Button variant="secondary" size="sm" className="flex items-center gap-1.5 mt-1">
                <Plus size={14} />
                New Page
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-0.5">
            {visible.map(({ doc, depth }) => (
              <Link key={doc.id} href={`/spaces/${spaceId}/docs/${doc.id}`} className="group block" style={{ paddingLeft: depth * 20 }}>
                <div className="flex items-center gap-3 px-4 py-2 rounded-lg border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                  {depth > 0 && <ChevronRight size={12} className="text-zinc-400 shrink-0" />}
                  <div
                    className={
                      doc.type === "pdf"
                        ? "p-1 rounded-md bg-red-50 dark:bg-red-950/40 text-red-500 shrink-0"
                        : "p-1 rounded-md bg-orange-50 dark:bg-orange-950/40 text-[#f25011] shrink-0"
                    }
                  >
                    {doc.type === "pdf" ? <File size={14} color="#f25011"/> : <FileText size={14} color="#f25011"/>}
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
              </Link>
            ))}
          </div>
          {hasMore && (
            <div className="flex justify-center mt-4 pb-4">
              <button
                type="button"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors"
              >
                Show more ({remaining} remaining)
              </button>
            </div>
          )}
        </>
      )}
        </>
      )}
    </div>
  );
}
