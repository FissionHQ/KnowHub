"use client";

import { useState } from "react";
import useSWR from "swr";
import { documentsApi } from "@/lib/api";
import type { DocumentVersionListItem } from "@wiki/types";
import { History, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { Spinner } from "@heroui/react";
import { useToast } from "@/components/ui/ToastProvider";

interface Props {
  documentId: string;
  onRestore: (content: string) => void;
}

export function VersionHistoryPanel({ documentId, onRestore }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  const { data: versions, isLoading } = useSWR<DocumentVersionListItem[]>(
    open ? `versions:${documentId}` : null,
    () => documentsApi.getVersions(documentId),
  );

  async function handleRestore(v: DocumentVersionListItem) {
    setRestoring(v.id);
    try {
      await documentsApi.restoreVersion(documentId, v.versionNumber);
      onRestore(v.contentSnapshot);
      toast(`Restored version ${v.versionNumber}`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to restore version", "error");
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden mb-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-zinc-50 dark:bg-zinc-900 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
      >
        <span className="flex items-center gap-2">
          <History size={14} />
          Version History
        </span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800 max-h-64 overflow-y-auto">
          {isLoading && (
            <div className="flex justify-center py-6">
              <Spinner size="sm" />
            </div>
          )}
          {versions?.map((v) => (
            <div
              key={v.id ?? `v${v.versionNumber}`}
              className="flex items-center justify-between px-4 py-2.5 text-sm bg-white dark:bg-zinc-900"
            >
              <div>
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  v{v.versionNumber}
                </span>
                <span className="text-zinc-400 ml-2">
                  {new Date(v.editedAt).toLocaleString()}
                </span>
                {v.editorName && (
                  <span className="text-zinc-400 ml-2">by {v.editorName}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleRestore(v)}
                disabled={restoring === v.id}
                className="flex items-center gap-1 text-xs text-[#f25011] hover:text-[#e0470f] cursor-pointer disabled:opacity-50"
              >
                {restoring === v.id ? (
                  <Spinner size="sm" />
                ) : (
                  <RotateCcw size={12} />
                )}
                Restore
              </button>
            </div>
          ))}
          {versions?.length === 0 && (
            <p className="text-xs text-zinc-400 text-center py-4">No versions yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
