"use client";

import useSWR from "swr";
import Link from "next/link";
import { documentsApi, spacesApi } from "@/lib/api";
import type { Document, Space } from "@wiki/types";
import { Button, Chip, Card, CardContent, Skeleton, Separator } from "@heroui/react";
import { FileText, Plus, File, ChevronRight } from "lucide-react";

interface Props { spaceId: string }

function DocRow({ doc, spaceId, depth = 0, allDocs }: { doc: Document; spaceId: string; depth?: number; allDocs: Document[] }) {
  const children = allDocs.filter((d) => d.parentId === doc.id);
  return (
    <>
      <Link href={`/spaces/${spaceId}/docs/${doc.id}`} className="group block" style={{ paddingLeft: depth * 20 }}>
        <Card className="transition-all hover:shadow-sm hover:border-zinc-300 dark:hover:border-zinc-600 cursor-pointer">
          <CardContent className="flex flex-row items-center gap-3 px-4 py-3">
            {depth > 0 && <ChevronRight size={12} className="text-zinc-400 shrink-0" />}
            <div
              className={
                doc.type === "pdf"
                  ? "p-1.5 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-500 shrink-0"
                  : "p-1.5 rounded-lg bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 shrink-0"
              }
            >
              {doc.type === "pdf" ? <File size={16} /> : <FileText size={16} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-zinc-900 dark:text-zinc-100 text-sm truncate group-hover:text-violet-700 dark:group-hover:text-violet-300 transition-colors">
                {doc.title}
              </p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                {new Date(doc.updatedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
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
              {doc.status === "published" && (
                <Chip size="sm" color="success" variant="soft" className="text-xs">
                  Published
                </Chip>
              )}
            </div>
          </CardContent>
        </Card>
      </Link>
      {children.map((child) => (
        <DocRow key={child.id} doc={child} spaceId={spaceId} depth={depth + 1} allDocs={allDocs} />
      ))}
    </>
  );
}

export function SpaceView({ spaceId }: Props) {
  const { data: space, isLoading: spaceLoading } = useSWR<Space>(
    `space:${spaceId}`,
    () => spacesApi.get(spaceId),
  );
  const { data: docs = [], isLoading: docsLoading } = useSWR<Document[]>(
    `space:${spaceId}:docs`,
    () => documentsApi.listBySpace(spaceId),
  );

  const rootDocs = docs.filter((d) => !d.parentId);

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

      {/* Document list */}
      {docsLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="w-full h-14 rounded-xl" />
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
        <div className="flex flex-col gap-1.5">
          {rootDocs.map((doc) => (
            <DocRow key={doc.id} doc={doc} spaceId={spaceId} allDocs={docs} />
          ))}
        </div>
      )}
    </div>
  );
}
