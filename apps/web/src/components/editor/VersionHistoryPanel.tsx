"use client";

import { useState } from "react";
import useSWR from "swr";
import { documentsApi } from "@/lib/api";
import type { DocumentVersionListItem } from "@wiki/types";
import { History, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
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
      const result = await documentsApi.restoreVersion(documentId, v.versionNumber);
      onRestore(v.contentSnapshot);
      toast(
        result.document.hasUnpublishedChanges
          ? `Version ${v.versionNumber} loaded into draft — publish when ready`
          : `Restored version ${v.versionNumber}`,
        "success",
      );
      if (result.reloadRequired) {
        window.setTimeout(() => window.location.reload(), 600);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to restore version", "error");
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div className="border border-border rounded-xl overflow-hidden mb-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-muted text-sm font-medium text-foreground/80 hover:bg-accent transition-colors"
      >
        <span className="flex items-center gap-2">
          <History size={14} />
          Version History
        </span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div className="divide-y divide-border max-h-64 overflow-y-auto">
          {isLoading && (
            <div className="flex justify-center py-6">
              <Spinner size={14} />
            </div>
          )}
          {versions?.map((v) => (
            <div
              key={v.id ?? `v${v.versionNumber}`}
              className="flex items-center justify-between px-4 py-2.5 text-sm bg-card"
            >
              <div>
                <span className="font-medium text-foreground">
                  v{v.versionNumber}
                </span>
                <span className="text-muted-foreground ml-2 truncate max-w-[120px] inline-block align-bottom">
                  {v.titleSnapshot}
                </span>
                <span className="text-muted-foreground ml-2">
                  {new Date(v.editedAt).toLocaleString()}
                </span>
                {v.editorName && (
                  <span className="text-muted-foreground ml-2">by {v.editorName}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleRestore(v)}
                disabled={restoring === v.id}
                className="flex items-center gap-1 text-xs text-primary hover:text-[#e0470f] cursor-pointer disabled:opacity-50"
              >
                {restoring === v.id ? (
                  <Spinner size={14} />
                ) : (
                  <RotateCcw size={12} />
                )}
                Restore
              </button>
            </div>
          ))}
          {versions?.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No versions yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
