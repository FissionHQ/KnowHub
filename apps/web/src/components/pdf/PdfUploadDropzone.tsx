"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { attachmentsApi } from "@/lib/api";
import { Button } from "@heroui/react";
import { FileUp, Upload } from "lucide-react";
import clsx from "clsx";

interface Props {
  spaceId: string;
}

export function PdfUploadDropzone({ spaceId }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
        setError("Please select a PDF file");
        return;
      }
      setUploading(true);
      setError(null);
      try {
        const result = await attachmentsApi.uploadPdf(spaceId, file);
        router.push(`/spaces/${spaceId}/docs/${result.documentId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [spaceId, router],
  );

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        className={clsx(
          "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
          dragging
            ? "border-violet-400 bg-violet-50 dark:bg-violet-950/30"
            : "border-zinc-200 dark:border-zinc-700 hover:border-violet-300",
          uploading && "opacity-50 pointer-events-none",
        )}
      >
        <FileUp size={32} className="mx-auto text-zinc-400 mb-3" />
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {uploading ? "Uploading PDF…" : "Drop a PDF here or click to browse"}
        </p>
        <p className="text-xs text-zinc-400 mt-1">PDF will be scanned and indexed for search</p>
      </div>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  );
}

interface ModalProps {
  spaceId: string;
  open: boolean;
  onClose: () => void;
}

export function PdfUploadModal({ spaceId, open, onClose }: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Upload size={18} />
            Upload PDF
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose}>×</Button>
        </div>
        <PdfUploadDropzone spaceId={spaceId} />
      </div>
    </div>
  );
}
