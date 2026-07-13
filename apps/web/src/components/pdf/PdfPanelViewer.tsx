"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Spinner } from "@heroui/react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Menu,
  MoreVertical,
  Printer,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import clsx from "clsx";
import { formatFileSize } from "@/components/documents/utils";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

interface Props {
  url: string;
  filename?: string;
  fileSizeBytes?: number | null;
}

function ToolbarBtn({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={clsx(
        "p-1.5 rounded transition-colors",
        disabled
          ? "text-zinc-500 cursor-not-allowed"
          : "text-zinc-200 hover:bg-zinc-700",
      )}
    >
      {children}
    </button>
  );
}

export function PdfPanelViewer({ url, filename, fileSizeBytes }: Props) {
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [containerWidth, setContainerWidth] = useState(320);

  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const mainAreaRef = useRef<HTMLDivElement>(null);

  const onLoadSuccess = useCallback((pdf: { numPages: number }) => {
    setNumPages(pdf.numPages);
    setLoading(false);
  }, []);

  useEffect(() => {
    const el = mainAreaRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setContainerWidth(Math.max(160, width - 32));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [sidebarOpen]);

  useEffect(() => {
    if (!numPages) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const top = visible[0];
        if (top) {
          const page = Number(top.target.getAttribute("data-page"));
          if (!Number.isNaN(page)) setCurrentPage(page);
        }
      },
      { root: null, threshold: [0.2, 0.4, 0.6, 0.8] },
    );

    for (const [, el] of pageRefs.current) observer.observe(el);
    return () => observer.disconnect();
  }, [numPages, zoom, sidebarOpen]);

  const pageWidth = Math.round(containerWidth * zoom);

  const scrollToPage = useCallback((page: number) => {
    const el = pageRefs.current.get(page);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setCurrentPage(page);
  }, []);

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename?.endsWith(".pdf") ? filename : `${filename ?? "document"}.pdf`;
    a.target = "_blank";
    a.rel = "noopener";
    a.click();
  };

  const handlePrint = () => {
    const printWindow = window.open(url, "_blank");
    printWindow?.addEventListener("load", () => printWindow.print());
  };

  const displayName = filename ?? "Document.pdf";
  const pages = Array.from({ length: numPages }, (_, i) => i + 1);

  return (
    <div className="rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800">
        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300 shrink-0">
          PDF
        </span>
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate min-w-0">
          {displayName}
        </span>
        <span className="text-xs text-zinc-400 shrink-0 ml-auto">
          {formatFileSize(fileSizeBytes)}
        </span>
      </div>

      <div className="flex items-center gap-0.5 px-2 py-1.5 bg-zinc-800 text-zinc-100 flex-wrap">
        <ToolbarBtn onClick={() => setSidebarOpen((v) => !v)} label="Toggle sidebar">
          <Menu size={16} />
        </ToolbarBtn>

        <div className="w-px h-4 bg-zinc-600 mx-0.5" />

        <ToolbarBtn
          onClick={() => scrollToPage(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          label="Previous page"
        >
          <ChevronLeft size={16} />
        </ToolbarBtn>

        <span className="text-xs tabular-nums min-w-[52px] text-center px-1">
          {loading ? "…" : `${currentPage} / ${numPages}`}
        </span>

        <ToolbarBtn
          onClick={() => scrollToPage(Math.min(numPages, currentPage + 1))}
          disabled={currentPage >= numPages}
          label="Next page"
        >
          <ChevronRight size={16} />
        </ToolbarBtn>

        <div className="w-px h-4 bg-zinc-600 mx-0.5" />

        <ToolbarBtn
          onClick={() => setZoom((z) => Math.max(0.4, parseFloat((z - 0.1).toFixed(1))))}
          disabled={zoom <= 0.4}
          label="Zoom out"
        >
          <ZoomOut size={16} />
        </ToolbarBtn>

        <span className="text-xs tabular-nums w-10 text-center text-zinc-300">
          {Math.round(zoom * 100)}%
        </span>

        <ToolbarBtn
          onClick={() => setZoom((z) => Math.min(2, parseFloat((z + 0.1).toFixed(1))))}
          disabled={zoom >= 2}
          label="Zoom in"
        >
          <ZoomIn size={16} />
        </ToolbarBtn>

        <ToolbarBtn onClick={() => setZoom(1)} label="Fit to width">
          <span className="text-[10px] font-semibold px-0.5">Fit</span>
        </ToolbarBtn>

        <ToolbarBtn onClick={() => setRotation((r) => (r + 90) % 360)} label="Rotate">
          <RotateCw size={16} />
        </ToolbarBtn>

        <div className="flex-1" />

        <ToolbarBtn onClick={handleDownload} label="Download">
          <Download size={16} />
        </ToolbarBtn>

        <ToolbarBtn onClick={handlePrint} label="Print">
          <Printer size={16} />
        </ToolbarBtn>

        <ToolbarBtn onClick={() => undefined} label="More options">
          <MoreVertical size={16} />
        </ToolbarBtn>
      </div>

      <Document
        file={url}
        onLoadSuccess={onLoadSuccess}
        onLoadError={() => setLoading(false)}
        loading=""
      >
        <div className="flex">
          {sidebarOpen && (
            <div className="w-24 shrink-0 bg-zinc-900 border-r border-zinc-700 py-3 px-2 space-y-3">
              {loading ? (
                <div className="flex justify-center py-6">
                  <Spinner size="sm" />
                </div>
              ) : (
                pages.map((page) => (
                  <button
                    key={page}
                    type="button"
                    onClick={() => scrollToPage(page)}
                    className={clsx(
                      "w-full rounded border-2 overflow-hidden transition-colors bg-white",
                      currentPage === page
                        ? "border-blue-500"
                        : "border-transparent hover:border-zinc-600",
                    )}
                  >
                    <Page
                      pageNumber={page}
                      width={72}
                      rotate={rotation}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                    />
                    <span className="block text-[10px] text-zinc-400 text-center py-1 bg-zinc-900">
                      {page}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}

          <div ref={mainAreaRef} className="flex-1 min-w-0 bg-zinc-500/90 dark:bg-zinc-600/90">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-20 text-zinc-200">
                <Spinner size="sm" />
                <span className="text-sm">Loading PDF…</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 py-4 px-4">
                {pages.map((page) => (
                  <div
                    key={page}
                    ref={(el) => {
                      if (el) pageRefs.current.set(page, el);
                      else pageRefs.current.delete(page);
                    }}
                    data-page={page}
                    className="shadow-lg"
                  >
                    <Page
                      pageNumber={page}
                      width={pageWidth}
                      rotate={rotation}
                      renderTextLayer
                      renderAnnotationLayer
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Document>
    </div>
  );
}
