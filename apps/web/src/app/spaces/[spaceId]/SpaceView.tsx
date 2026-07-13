"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { documentsApi, spacesApi } from "@/lib/api";
import type { DocumentListItem, Space } from "@wiki/types";
import { Button, Card, CardContent, Skeleton, Separator } from "@heroui/react";
import { FileText, Plus, Upload, FileInput } from "lucide-react";
import { PdfUploadModal } from "@/components/pdf/PdfUploadDropzone";
import { DocxImportModal } from "@/components/import/DocxImportModal";
import { DocumentListRow } from "@/components/documents/DocumentListRow";

interface Props { spaceId: string }

export function SpaceView({ spaceId }: Props) {
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [docxModalOpen, setDocxModalOpen] = useState(false);
  const { data: space, isLoading: spaceLoading } = useSWR<Space>(
    `space:${spaceId}`,
    () => spacesApi.get(spaceId),
  );
  const { data: docs = [], isLoading: docsLoading, mutate: mutateDocs } = useSWR<DocumentListItem[]>(
    `space:${spaceId}:docs`,
    () => documentsApi.listBySpace(spaceId),
  );

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
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" size="sm" className="flex items-center gap-1.5" onClick={() => setPdfModalOpen(true)}>
            <Upload size={14} />
            Upload PDF
          </Button>
          <Button variant="secondary" size="sm" className="flex items-center gap-1.5" onClick={() => setDocxModalOpen(true)}>
            <FileInput size={14} />
            Import DOCX
          </Button>
          <Link href={`/spaces/${spaceId}/new` as never}>
            <Button variant="primary" size="sm" className="flex items-center gap-1.5">
              <Plus size={14} />
              New Page
            </Button>
          </Link>
        </div>
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
          {docs.map((doc) => (
            <DocumentListRow
              key={doc.id}
              doc={doc}
              spaceId={spaceId}
              onDeleted={() => mutateDocs()}
            />
          ))}
        </div>
      )}
      <PdfUploadModal spaceId={spaceId} open={pdfModalOpen} onClose={() => setPdfModalOpen(false)} />
      <DocxImportModal spaceId={spaceId} open={docxModalOpen} onClose={() => setDocxModalOpen(false)} />
    </div>
  );
}
