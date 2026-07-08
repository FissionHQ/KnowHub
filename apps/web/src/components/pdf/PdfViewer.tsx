"use client";

import { useState, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Spinner } from "@heroui/react";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import clsx from "clsx";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

interface Props {
  url: string;
  filename?: string;
}

function NavBtn({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "p-1.5 rounded-md transition-colors",
        disabled
          ? "text-zinc-300 cursor-not-allowed"
          : "text-zinc-600 hover:bg-zinc-100",
      )}
    >
      {children}
    </button>
  );
}

export function PdfViewer({ url, filename }: Props) {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [loading, setLoading] = useState(true);

  const onLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setLoading(false);
  }, []);

  return (
    <div className="flex flex-col items-center gap-5">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 bg-white border border-zinc-200 rounded-xl shadow-sm sticky top-4 z-10">
        <NavBtn
          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          disabled={currentPage <= 1}
        >
          <ChevronLeft size={16} />
        </NavBtn>

        <span className="text-sm text-zinc-600 min-w-[68px] text-center tabular-nums px-1">
          {loading ? "…" : `${currentPage} / ${numPages}`}
        </span>

        <NavBtn
          onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
          disabled={currentPage >= numPages}
        >
          <ChevronRight size={16} />
        </NavBtn>

        <div className="w-px h-4 bg-zinc-200 mx-1" />

        <NavBtn
          onClick={() => setScale((s) => Math.max(0.5, parseFloat((s - 0.2).toFixed(1))))}
          disabled={scale <= 0.5}
        >
          <ZoomOut size={16} />
        </NavBtn>

        <span className="text-xs text-zinc-500 w-9 text-center tabular-nums">
          {Math.round(scale * 100)}%
        </span>

        <NavBtn
          onClick={() => setScale((s) => Math.min(3, parseFloat((s + 0.2).toFixed(1))))}
          disabled={scale >= 3}
        >
          <ZoomIn size={16} />
        </NavBtn>

        {filename && (
          <>
            <div className="w-px h-4 bg-zinc-200 mx-1" />
            <span className="text-xs text-zinc-400 max-w-[140px] truncate px-1">{filename}</span>
          </>
        )}
      </div>

      {/* PDF canvas */}
      {loading && (
        <div className="flex items-center gap-3 text-zinc-400 py-16">
          <Spinner size="sm" />
          <span className="text-sm">Loading PDF…</span>
        </div>
      )}

      <Document
        file={url}
        onLoadSuccess={onLoadSuccess}
        loading=""
        className="shadow-2xl rounded-lg overflow-hidden"
      >
        <Page
          pageNumber={currentPage}
          scale={scale}
          renderTextLayer
          renderAnnotationLayer
        />
      </Document>
    </div>
  );
}
