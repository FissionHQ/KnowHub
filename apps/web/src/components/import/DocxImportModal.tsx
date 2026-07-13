"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { importApi } from "@/lib/api";
import { Button } from "@heroui/react";
import { FileText } from "lucide-react";

interface Props {
  spaceId: string;
  open: boolean;
  onClose: () => void;
}

export function DocxImportModal({ spaceId, open, onClose }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  if (!open) return null;

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".docx")) {
      setError("Please select a .docx file (export from Google Docs or Word)");
      return;
    }
    setImporting(true);
    setError(null);
    setWarnings([]);
    try {
      const result = await importApi.uploadDocx(spaceId, file);
      if (result.warnings.length) setWarnings(result.warnings);
      onClose();
      router.push(`/spaces/${spaceId}/docs/${result.document.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FileText size={18} />
            Import DOCX
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose}>×</Button>
        </div>

        <p className="text-sm text-zinc-500 mb-4">
          Upload a .docx file exported from Google Docs or Microsoft Word. It will be converted to a wiki page.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />

        <Button
          variant="primary"
          className="w-full"
          isDisabled={importing}
          onClick={() => inputRef.current?.click()}
        >
          {importing ? "Converting…" : "Choose .docx file"}
        </Button>

        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        {warnings.length > 0 && (
          <div className="mt-3 p-3 bg-amber-50 rounded-lg text-xs text-amber-700">
            <p className="font-medium mb-1">Import warnings:</p>
            {warnings.map((w, i) => <p key={i}>{w}</p>)}
          </div>
        )}
      </div>
    </div>
  );
}
