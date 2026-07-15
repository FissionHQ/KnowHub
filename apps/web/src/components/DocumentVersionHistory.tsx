"use client";

import { useState } from "react";
import useSWR from "swr";
import { documentsApi } from "@/lib/api";
import type { DocumentVersionListItem } from "@wiki/types";
import { Button, Card, CardContent } from "@heroui/react";
import { History, RotateCcw } from "lucide-react";

interface Props {
  documentId: string;
  currentVersion: number;
  canEdit: boolean;
}

export function DocumentVersionHistory({ documentId, currentVersion, canEdit }: Props) {
  const { data: versions = [], mutate } = useSWR(
    `doc-versions:${documentId}`,
    () => documentsApi.getVersions(documentId),
  );
  const [restoring, setRestoring] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRestore(version: DocumentVersionListItem) {
    if (
      !confirm(
        `Restore version ${version.versionNumber}? This creates a new revision and reloads the document.`,
      )
    ) {
      return;
    }

    setRestoring(version.versionNumber);
    setError(null);
    try {
      const result = await documentsApi.restoreVersion(documentId, version.versionNumber);
      await mutate();
      if (result.reloadRequired) {
        window.location.reload();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore version");
      setRestoring(null);
    }
  }

  if (!versions.length) return null;

  return (
    <Card className="mb-5">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <History size={16} className="text-zinc-500" />
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Version history
          </h2>
          <span className="text-xs text-zinc-400">Current: v{currentVersion}</span>
        </div>

        <ul className="space-y-2 max-h-56 overflow-y-auto">
          {versions.map((version) => (
            <li
              key={version.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-zinc-100 dark:border-zinc-800 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Version {version.versionNumber}
                  {version.versionNumber === currentVersion && (
                    <span className="ml-2 text-xs font-normal text-emerald-600">current</span>
                  )}
                </div>
                <div className="text-xs text-zinc-500 truncate">
                  {version.editorName ?? "Unknown"} ·{" "}
                  {new Date(version.editedAt).toLocaleString()}
                </div>
              </div>
              {canEdit && version.versionNumber !== currentVersion && (
                <Button
                  variant="secondary"
                  size="sm"
                  isDisabled={restoring !== null}
                  onPress={() => handleRestore(version)}
                >
                  <RotateCcw size={12} />
                  {restoring === version.versionNumber ? "Restoring…" : "Restore"}
                </Button>
              )}
            </li>
          ))}
        </ul>

        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      </CardContent>
    </Card>
  );
}
