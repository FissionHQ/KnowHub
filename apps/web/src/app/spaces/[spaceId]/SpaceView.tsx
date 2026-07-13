"use client";

import { Suspense, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { documentsApi, spacesApi } from "@/lib/api";
import type { DocumentListItem, Space } from "@wiki/types";
import { Button, Skeleton, Separator } from "@heroui/react";
import { FileText, Plus } from "lucide-react";
import { PdfUploadModal } from "@/components/pdf/PdfUploadDropzone";
import { DocxImportModal } from "@/components/import/DocxImportModal";
import { DocumentDrawerProvider } from "@/components/documents/DocumentDrawerContext";
import { DocumentTable } from "@/components/documents/DocumentTable";
import { DocumentPreviewDrawer } from "@/components/documents/DocumentPreviewDrawer";

interface Props { spaceId: string }

function SpaceDocumentsContent({ spaceId }: Props) {
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [docxModalOpen, setDocxModalOpen] = useState(false);

  const { data: space, isLoading: spaceLoading } = useSWR<Space>(
    `space:${spaceId}`,
    () => spacesApi.get(spaceId),
  );
  const {
    data: docs = [],
    isLoading: docsLoading,
    mutate: mutateDocs,
    isValidating,
  } = useSWR<DocumentListItem[]>(`space:${spaceId}:docs`, () =>
    documentsApi.listBySpace(spaceId),
  );

  return (
    <DocumentDrawerProvider documents={docs}>
      <div className="flex h-full min-h-0">
        <div className="flex flex-col flex-1 min-w-0">
          {/* Page header */}
          <div className="px-6 pt-6 pb-4 shrink-0">
          <nav
            aria-label="Breadcrumb"
            className="text-xs text-zinc-400 mb-3 flex items-center gap-1.5"
          >
            <Link href="/spaces" className="hover:text-violet-600 transition-colors">
              Spaces
            </Link>
            <span aria-hidden="true">/</span>
            <span className="text-zinc-600 dark:text-zinc-300 font-medium">
              {space?.name ?? "Space"}
            </span>
          </nav>

          <div className="flex items-center gap-4">
            {spaceLoading ? (
              <>
                <Skeleton className="w-10 h-10 rounded-lg" />
                <Skeleton className="w-48 h-6 rounded-md" />
              </>
            ) : (
              <>
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xl shrink-0">
                  {space?.iconEmoji ?? "📄"}
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 leading-tight">
                    {space?.name ?? "Documents"}
                  </h1>
                  {space?.description && (
                    <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-0.5 truncate">
                      {space.description}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
          </div>

          <Separator />

          {/* Full-width document table */}
          <div className="flex-1 min-h-0">
          {docsLoading ? (
            <DocumentTable
              spaceId={spaceId}
              documents={[]}
              isLoading
              onRefresh={() => mutateDocs()}
              onUploadPdf={() => setPdfModalOpen(true)}
              onImportDocx={() => setDocxModalOpen(true)}
            />
          ) : docs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-zinc-400 gap-3">
              <FileText size={40} className="opacity-30" />
              <p className="text-sm">No documents yet. Create the first page.</p>
              <Link href={`/spaces/${spaceId}/new` as never}>
                <Button variant="secondary" size="sm" className="gap-1.5">
                  <Plus size={14} />
                  New Page
                </Button>
              </Link>
            </div>
          ) : (
            <DocumentTable
              spaceId={spaceId}
              documents={docs}
              isLoading={false}
              onRefresh={() => mutateDocs()}
              isRefreshing={isValidating}
              onUploadPdf={() => setPdfModalOpen(true)}
              onImportDocx={() => setDocxModalOpen(true)}
            />
          )}
          </div>

          <PdfUploadModal
            spaceId={spaceId}
            open={pdfModalOpen}
            onClose={() => setPdfModalOpen(false)}
          />
          <DocxImportModal
            spaceId={spaceId}
            open={docxModalOpen}
            onClose={() => setDocxModalOpen(false)}
          />
        </div>

        <DocumentPreviewDrawer spaceId={spaceId} onMutate={() => mutateDocs()} />
      </div>
    </DocumentDrawerProvider>
  );
}

export function SpaceView({ spaceId }: Props) {
  return (
    <Suspense fallback={<div className="p-8"><Skeleton className="w-full h-96 rounded-xl" /></div>}>
      <SpaceDocumentsContent spaceId={spaceId} />
    </Suspense>
  );
}
