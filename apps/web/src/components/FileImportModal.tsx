"use client";

import { createPortal } from "react-dom";
import { FileText, FileUp } from "lucide-react";

export type ImportFileKind = "pdf" | "pptx";

interface Props {
  kind: ImportFileKind;
  fileName: string;
  onConvert: () => void;
  onAttach: () => void;
  onCancel: () => void;
}

const COPY: Record<
  ImportFileKind,
  { title: string; viewLabel: string; viewHint: string; convertHint: string }
> = {
  pdf: {
    title: "Import PDF",
    viewLabel: "View as PDF",
    viewHint: "Attach and view the original file",
    convertHint: "Extract text as an editable page",
  },
  pptx: {
    title: "Import PowerPoint",
    viewLabel: "View as presentation",
    viewHint: "Attach and view the original slides (.ppt or .pptx)",
    convertHint: "Extract slide text as an editable page",
  },
};

export function FileImportModal({ kind, fileName, onConvert, onAttach, onCancel }: Props) {
  const copy = COPY[kind];

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h2 className="text-base font-semibold text-foreground mb-1">{copy.title}</h2>
        <p className="text-sm text-muted-foreground mb-5 truncate">
          How would you like to import <span className="font-medium text-foreground">{fileName}</span>?
        </p>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <button
            type="button"
            onClick={onAttach}
            className="flex flex-col items-center gap-3 p-4 rounded-xl border border-border hover:border-[#ff844b] hover:bg-orange-50 dark:hover:bg-orange-950/20 transition-colors group"
          >
            <FileUp size={28} className="text-muted-foreground group-hover:text-[#ff844b] transition-colors" />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">{copy.viewLabel}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{copy.viewHint}</p>
            </div>
          </button>

          <button
            type="button"
            onClick={onConvert}
            className="flex flex-col items-center gap-3 p-4 rounded-xl border border-border hover:border-[#ff844b] hover:bg-orange-50 dark:hover:bg-orange-950/20 transition-colors group"
          >
            <FileText size={28} className="text-muted-foreground group-hover:text-[#ff844b] transition-colors" />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Convert to document</p>
              <p className="text-xs text-muted-foreground mt-0.5">{copy.convertHint}</p>
            </div>
          </button>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
        >
          Cancel
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** @deprecated Prefer FileImportModal with kind="pdf" */
export function PdfImportModal(props: Omit<Props, "kind">) {
  return <FileImportModal kind="pdf" {...props} />;
}
