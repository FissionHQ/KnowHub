"use client";

import type { DocumentListItem } from "@wiki/types";
import { File, FileText } from "lucide-react";
import clsx from "clsx";

interface Props {
  doc: DocumentListItem;
  size?: number;
  className?: string;
}

export function DocumentFileIcon({ doc, size = 18, className }: Props) {
  return (
    <div
      className={clsx(
        "p-1.5 rounded-md shrink-0",
        doc.type === "pdf"
          ? "bg-red-50 dark:bg-red-950/40 text-red-500"
          : "bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400",
        className,
      )}
    >
      {doc.type === "pdf" ? <File size={size} /> : <FileText size={size} />}
    </div>
  );
}
