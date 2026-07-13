"use client";

import dynamic from "next/dynamic";
import type { Document, DocumentListItem } from "@wiki/types";
import { Spinner } from "@heroui/react";
import { AlertCircle, Clock, File, FileText, Image as ImageIcon } from "lucide-react";
import type { ProcessingStatus } from "./types";
import { DocumentPageContent } from "./DocumentPageContent";

const PdfPanelViewer = dynamic(
  () => import("@/components/pdf/PdfPanelViewer").then((m) => m.PdfPanelViewer),
  { ssr: false, loading: () => <PreviewSkeleton label="Loading PDF viewer…" /> },
);

interface Props {
  doc: DocumentListItem;
  pdfUrl: string | null;
  processingStatus: ProcessingStatus;
  fullDocument?: Document | null;
  onSaveStatusChange?: (status: "saved" | "saving" | "unsaved") => void;
  onContentSaved?: () => void;
}

function PreviewSkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-zinc-400">
      <Spinner size="sm" />
      <span className="text-xs">{label}</span>
    </div>
  );
}

export function DocumentPreview({
  doc,
  pdfUrl,
  processingStatus,
  fullDocument,
  onSaveStatusChange,
  onContentSaved,
}: Props) {
  if (doc.type === "pdf") {
    if (processingStatus === "processing") {
      return (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-zinc-500">
          <Clock size={20} className="animate-pulse text-violet-500" />
          <p className="text-sm font-medium">Processing PDF…</p>
          <p className="text-xs text-zinc-400">This usually takes a few seconds</p>
        </div>
      );
    }

    if (processingStatus === "error") {
      return (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-red-500">
          <AlertCircle size={20} />
          <p className="text-sm font-medium">PDF processing failed</p>
          <p className="text-xs text-red-400">Try re-uploading the file</p>
        </div>
      );
    }

    if (pdfUrl) {
      return (
        <PdfPanelViewer
          url={pdfUrl}
          filename={doc.title}
          fileSizeBytes={doc.fileSizeBytes}
        />
      );
    }

    return <PreviewSkeleton label="Loading preview…" />;
  }

  if (doc.fileType?.startsWith("image/")) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-zinc-400">
        <ImageIcon size={32} className="opacity-40" />
        <p className="text-sm">Image preview</p>
      </div>
    );
  }

  if (doc.type === "page") {
    return (
      <DocumentPageContent
        documentId={doc.id}
        fullDocument={fullDocument ?? null}
        canEdit={doc.canEdit ?? false}
        {...(onSaveStatusChange ? { onSaveStatusChange } : {})}
        {...(onContentSaved ? { onContentSaved } : {})}
      />
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-zinc-400">
      <File size={32} className="opacity-40" />
      <p className="text-sm">No preview available</p>
    </div>
  );
}
