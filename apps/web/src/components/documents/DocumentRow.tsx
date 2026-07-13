"use client";

import type { DocumentListItem } from "@wiki/types";
import { Chip } from "@heroui/react";
import { File, FileText } from "lucide-react";
import clsx from "clsx";
import {
  categoryColor,
  categoryLabel,
  formatShortDate,
  ownerAvatarColor,
  ownerInitials,
} from "./utils";
import { getProcessingStatus } from "./types";

interface Props {
  doc: DocumentListItem;
  isSelected: boolean;
  isFocused: boolean;
  onSelect: () => void;
  onFocus: () => void;
  rowRef?: (el: HTMLButtonElement | null) => void;
}

function StatusBadge({ doc }: { doc: DocumentListItem }) {
  const processing = getProcessingStatus(doc);
  if (processing === "processing") {
    return (
      <Chip size="sm" color="warning" variant="soft" className="text-xs">
        Processing
      </Chip>
    );
  }
  if (processing === "error") {
    return (
      <Chip size="sm" color="danger" variant="soft" className="text-xs">
        Error
      </Chip>
    );
  }
  if (processing === "ready" && doc.type === "pdf") {
    return (
      <Chip size="sm" color="success" variant="soft" className="text-xs">
        Ready
      </Chip>
    );
  }
  if (doc.status === "draft") {
    return (
      <Chip size="sm" color="warning" variant="soft" className="text-xs">
        Draft
      </Chip>
    );
  }
  return null;
}

export function DocumentRow({
  doc,
  isSelected,
  isFocused,
  onSelect,
  onFocus,
  rowRef,
}: Props) {
  const category = categoryLabel(doc.tags);

  return (
    <button
      ref={rowRef}
      type="button"
      role="row"
      aria-selected={isSelected}
      onClick={onSelect}
      onFocus={onFocus}
      className={clsx(
        "w-full grid grid-cols-[minmax(0,1fr)_180px_40px_120px_100px] gap-3 items-center px-4 py-2.5 text-left transition-colors duration-200 border-b border-zinc-100 dark:border-zinc-800/80",
        "hover:bg-zinc-50 dark:hover:bg-zinc-900/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 focus-visible:ring-inset",
        isSelected && "bg-violet-50 dark:bg-violet-950/30 border-violet-200/60 dark:border-violet-900/40",
        isFocused && !isSelected && "bg-zinc-50/80 dark:bg-zinc-900/40",
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={clsx(
            "p-1.5 rounded-md shrink-0",
            doc.type === "pdf"
              ? "bg-red-50 dark:bg-red-950/40 text-red-500"
              : "bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400",
          )}
        >
          {doc.type === "pdf" ? <File size={15} /> : <FileText size={15} />}
        </div>
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
          {doc.title}
        </span>
      </div>

      <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate hidden sm:block">
        {formatShortDate(doc.updatedAt)}
      </span>

      <span
        className={clsx(
          "inline-flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-semibold text-white shrink-0 justify-self-center",
          ownerAvatarColor(doc.ownerId),
        )}
        title={doc.ownerName}
      >
        {ownerInitials(doc.ownerName, doc.ownerEmail)}
      </span>

      <span
        className={clsx(
          "inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-medium truncate hidden md:inline-flex",
          categoryColor(category),
        )}
      >
        {category}
      </span>

      <div className="flex justify-end">
        <StatusBadge doc={doc} />
      </div>
    </button>
  );
}
