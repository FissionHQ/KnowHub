"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { documentsApi } from "@/lib/api";
import type { DocumentVersionListItem } from "@wiki/types";
import { Tooltip } from "@heroui/react";
import { RotateCcw } from "lucide-react";
import { useToast } from "@/components/ui/ToastProvider";

interface Props {
  documentId: string;
  currentVersion: number;
  canEdit: boolean;
  defaultOpen?: boolean;
}

function VersionDetailTooltip({
  version,
  isCurrent,
  children,
}: {
  version: DocumentVersionListItem;
  isCurrent: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <Tooltip.Trigger>{children}</Tooltip.Trigger>
      <Tooltip.Content>
        <div className="text-xs space-y-0.5 max-w-[200px]">
          <p className="font-medium">
            Version {version.versionNumber}
            {isCurrent && <span className="text-emerald-600 ml-1">current</span>}
          </p>
          <p className="text-zinc-600 dark:text-zinc-300 truncate">{version.titleSnapshot}</p>
          <p className="text-zinc-500">{version.editorName ?? "Unknown"}</p>
          <p className="text-zinc-400">{new Date(version.editedAt).toLocaleString()}</p>
        </div>
      </Tooltip.Content>
    </Tooltip>
  );
}

export function DocumentVersionHistory({ documentId, currentVersion, canEdit }: Props) {
  const { toast } = useToast();
  const { data: versions = [], mutate } = useSWR(
    `doc-versions:${documentId}`,
    () => documentsApi.getVersions(documentId),
  );
  const [restoring, setRestoring] = useState<number | null>(null);

  useEffect(() => {
    void mutate();
  }, [mutate]);

  const effectiveCurrentVersion =
    versions.length > 0
      ? Math.max(currentVersion, versions[0]!.versionNumber)
      : currentVersion;

  async function handleRestore(version: DocumentVersionListItem) {
    setRestoring(version.versionNumber);
    try {
      const result = await documentsApi.restoreVersion(documentId, version.versionNumber);
      await mutate();
      toast(
        result.document.hasUnpublishedChanges
          ? `Version ${version.versionNumber} loaded into draft — publish when ready`
          : `Restored version ${version.versionNumber}`,
        "success",
      );
      if (result.reloadRequired) {
        window.setTimeout(() => window.location.reload(), 600);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to restore version", "error");
      setRestoring(null);
    }
  }

  if (!versions.length) {
    return (
      <p className="text-xs text-zinc-400 px-1">No versions yet.</p>
    );
  }

  return (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {versions.map((version) => {
        const isCurrent = version.versionNumber === effectiveCurrentVersion;
        return (
          <li
            key={version.id ?? `v${version.versionNumber}`}
            className="flex items-center justify-between gap-2 px-4 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
          >
            <VersionDetailTooltip version={version} isCurrent={isCurrent}>
              <span
                className={`cursor-default ${
                  isCurrent
                    ? "text-emerald-700 dark:text-emerald-400 font-medium"
                    : "text-zinc-700 dark:text-zinc-300"
                }`}
              >
                Version {version.versionNumber}
              </span>
            </VersionDetailTooltip>

            <div className="flex items-center gap-2 shrink-0">
              {isCurrent && (
                <span className="text-[10px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400 font-medium">
                  current
                </span>
              )}
              {canEdit && !isCurrent && (
                <Tooltip>
                  <Tooltip.Trigger>
                    <button
                      type="button"
                      disabled={restoring !== null}
                      onClick={() => handleRestore(version)}
                      aria-label={`Restore version ${version.versionNumber}`}
                      className="p-1 rounded-md text-zinc-400 hover:text-[#f25011] hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-40"
                    >
                      <RotateCcw
                        size={13}
                        className={restoring === version.versionNumber ? "animate-spin" : ""}
                      />
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Content>
                    <p className="text-xs">
                      {restoring === version.versionNumber ? "Restoring…" : "Restore"}
                    </p>
                  </Tooltip.Content>
                </Tooltip>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
