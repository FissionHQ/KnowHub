"use client";

import { useMemo, useState } from "react";
import type { Document, DocumentListItem } from "@wiki/types";
import { Chip } from "@heroui/react";
import { formatDateTime, formatFileSize } from "./utils";
import { getProcessingStatus } from "./types";

interface Props {
  doc: DocumentListItem;
  fullDoc?: Document | null;
  spaceName?: string;
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="text-xs text-zinc-400 w-24 shrink-0 pt-0.5">{label}</span>
      <div className="text-sm text-zinc-700 dark:text-zinc-300 flex-1 min-w-0">{children}</div>
    </div>
  );
}

export function DocumentMetadata({ doc, fullDoc, spaceName }: Props) {
  const [expanded, setExpanded] = useState(false);
  const processing = getProcessingStatus(doc);

  const hiddenCount = useMemo(() => {
    let count = 6;
    if (spaceName) count += 1;
    return count;
  }, [spaceName]);

  return (
    <div>
      <MetaRow label="Created By">
        <span className="truncate">{doc.ownerName}</span>
      </MetaRow>

      <MetaRow label="Created Time">
        {formatDateTime(doc.createdAt)}
      </MetaRow>

      <MetaRow label="Tags">
        {doc.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {doc.tags.map((tag) => (
              <Chip key={tag} size="sm" variant="secondary" className="text-xs">
                {tag}
              </Chip>
            ))}
          </div>
        ) : (
          <span className="text-zinc-400">—</span>
        )}
      </MetaRow>

      {expanded && (
        <>
          {spaceName && (
            <MetaRow label="Space">
              <span>{spaceName}</span>
            </MetaRow>
          )}

          <MetaRow label="Category">
            {doc.tags[0] ? (
              <Chip size="sm" variant="secondary" className="text-xs">
                {doc.tags[0]}
              </Chip>
            ) : (
              <span className="text-zinc-400">—</span>
            )}
          </MetaRow>

          <MetaRow label="Modified">
            {formatDateTime(doc.updatedAt)}
          </MetaRow>

          <MetaRow label="File size">
            {formatFileSize(doc.fileSizeBytes)}
          </MetaRow>

          <MetaRow label="File type">
            {doc.fileType ?? (doc.type === "page" ? "Wiki page" : doc.type.toUpperCase())}
          </MetaRow>

          <MetaRow label="Version">
            v{fullDoc?.version ?? doc.version}
          </MetaRow>

          <MetaRow label="Status">
            <div className="flex flex-wrap gap-1.5">
              {doc.status === "draft" && (
                <Chip size="sm" color="warning" variant="soft">
                  Draft
                </Chip>
              )}
              {doc.status === "published" && (
                <Chip size="sm" color="success" variant="soft">
                  Published
                </Chip>
              )}
              {processing === "processing" && (
                <Chip size="sm" color="warning" variant="soft">
                  Processing
                </Chip>
              )}
              {processing === "ready" && doc.type === "pdf" && (
                <Chip size="sm" color="success" variant="soft">
                  Ready
                </Chip>
              )}
              {processing === "error" && (
                <Chip size="sm" color="danger" variant="soft">
                  Error
                </Chip>
              )}
            </div>
          </MetaRow>
        </>
      )}

      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="mt-1 text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 transition-colors"
      >
        {expanded ? "Show less" : `${hiddenCount} more options`}
      </button>
    </div>
  );
}
