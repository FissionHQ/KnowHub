"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { documentsApi } from "@/lib/api";
import type { DocumentVersionListItem } from "@wiki/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RotateCcw, Eye } from "lucide-react";
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
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>
        <div className="text-xs space-y-0.5 max-w-[200px]">
          <p className="font-medium">
            Version {version.versionNumber}
            {isCurrent && <span className="text-emerald-600 ml-1">current</span>}
          </p>
          <p className="text-muted-foreground truncate">{version.titleSnapshot}</p>
          <p className="text-muted-foreground">{version.editorName ?? "Unknown"}</p>
          <p className="text-muted-foreground">{new Date(version.editedAt).toLocaleString()}</p>
        </div>
      </TooltipContent>
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
  const sessionKey = `viewing-version:${documentId}`;
  const [viewingVersion, setViewingVersion] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const stored = sessionStorage.getItem(sessionKey);
    return stored ? Number(stored) : null;
  });
  const prevCurrentVersion = useRef(currentVersion);

  useEffect(() => {
    void mutate();
  }, [mutate]);

  // Clear eye only when currentVersion actually advances (new publish happened)
  useEffect(() => {
    if (prevCurrentVersion.current !== currentVersion) {
      prevCurrentVersion.current = currentVersion;
      setViewingVersion(null);
      sessionStorage.removeItem(sessionKey);
    }
  }, [currentVersion, sessionKey]);

  const effectiveCurrentVersion =
    versions.length > 0
      ? Math.max(currentVersion, versions[0]!.versionNumber)
      : currentVersion;

  async function handleRestore(version: DocumentVersionListItem) {
    setRestoring(version.versionNumber);
    try {
      const result = await documentsApi.restoreVersion(documentId, version.versionNumber);
      await mutate();
      setViewingVersion(version.versionNumber);
      sessionStorage.setItem(sessionKey, String(version.versionNumber));
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
      <p className="text-xs text-muted-foreground px-1">No versions yet.</p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {versions.map((version) => {
        const isCurrent = version.versionNumber === effectiveCurrentVersion;
        const isViewing = viewingVersion !== null && version.versionNumber === viewingVersion && !isCurrent;
        return (
          <li
            key={version.id ?? `v${version.versionNumber}`}
            className="flex items-center justify-between gap-2 px-4 py-2 text-sm hover:bg-accent"
          >
            <VersionDetailTooltip version={version} isCurrent={isCurrent}>
              <span
                className={`cursor-default ${
                  isCurrent
                    ? "text-emerald-700 dark:text-emerald-400 font-medium"
                    : "text-foreground/80"
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
              {isViewing && !isCurrent && (
                <Eye size={13} className="text-primary shrink-0" />
              )}
              {canEdit && !isCurrent && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      disabled={restoring !== null}
                      onClick={() => handleRestore(version)}
                      aria-label={`Restore version ${version.versionNumber}`}
                      className="p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-accent transition-colors disabled:opacity-40"
                    >
                      <RotateCcw
                        size={13}
                        className={restoring === version.versionNumber ? "animate-spin" : ""}
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">
                      {restoring === version.versionNumber ? "Restoring…" : "Restore"}
                    </p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
