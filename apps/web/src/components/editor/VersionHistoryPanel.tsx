"use client";

import { useState } from "react";
import useSWR from "swr";
import { documentsApi } from "@/lib/api";
import { Button, Card, CardContent } from "@heroui/react";
import { History, RotateCcw } from "lucide-react";

interface Version {
  id: string;
  versionNumber: number;
  editedAt: string;
}

interface Props {
  documentId: string;
  onRestore: (content: string) => void;
}

export function VersionHistoryPanel({ documentId, onRestore }: Props) {
  const [open, setOpen] = useState(false);
  const [restoring, setRestoring] = useState<number | null>(null);

  const { data: versions = [], mutate } = useSWR<Version[]>(
    open ? `versions:${documentId}` : null,
    () => documentsApi.getVersions(documentId),
  );

  async function handleRestore(versionNumber: number) {
    setRestoring(versionNumber);
    try {
      const doc = await documentsApi.restoreVersion(documentId, versionNumber);
      if (doc.contentRef) onRestore(doc.contentRef);
      mutate();
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div className="mb-4">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5"
      >
        <History size={14} />
        Version History
      </Button>

      {open && (
        <Card className="mt-3">
          <CardContent className="p-4 space-y-2">
            {versions.length === 0 ? (
              <p className="text-sm text-zinc-400">No versions yet.</p>
            ) : (
              versions.map((v) => (
                <div key={v.id} className="flex items-center justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                  <div>
                    <span className="text-sm font-medium">v{v.versionNumber}</span>
                    <span className="text-xs text-zinc-400 ml-2">
                      {new Date(v.editedAt).toLocaleString()}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    isDisabled={restoring === v.versionNumber}
                    onClick={() => handleRestore(v.versionNumber)}
                    className="flex items-center gap-1 text-xs"
                  >
                    <RotateCcw size={12} />
                    {restoring === v.versionNumber ? "Restoring…" : "Restore"}
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
