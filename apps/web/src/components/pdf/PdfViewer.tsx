"use client";

import { useState, useCallback, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Spinner } from "@heroui/react";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Search, Download, X } from "lucide-react";
import clsx from "clsx";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

interface Props {
  url: string;
  filename?: string;
  restrictDownload?: boolean;
}

function NavBtn({
  onClick,
  disabled,
  children,
  title,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={clsx(
        "p-1.5 rounded-md transition-colors",
        disabled
          ? "text-zinc-300 dark:text-zinc-600 cursor-not-allowed"
          : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800",
      )}
    >
      {children}
    </button>
  );
}

export function PdfViewer({ url, filename, restrictDownload = false }: Props) {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [loading, setLoading] = useState(true);

  // Search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<number[]>([]);
  const [searchIdx, setSearchIdx] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const pdfDocRef = useRef<any>(null);

  const onLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setLoading(false);
  }, []);

  // Search within PDF text layers
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || !pdfDocRef.current) return;
    const doc = pdfDocRef.current;
    const matches: number[] = [];
    const q = searchQuery.toLowerCase();

    for (let i = 1; i <= numPages; i++) {
      try {
        const page = await doc.getPage(i);
        const textContent = await page.getTextContent();
        const text = textContent.items.map((item: any) => item.str).join(" ").toLowerCase();
        if (text.includes(q)) matches.push(i);
      } catch { /* skip unreadable pages */ }
    }

    setSearchResults(matches);
    setSearchIdx(0);
    if (matches.length > 0) setCurrentPage(matches[0]!);
  }, [searchQuery, numPages]);

  const nextSearchResult = () => {
    if (!searchResults.length) return;
    const next = (searchIdx + 1) % searchResults.length;
    setSearchIdx(next);
    setCurrentPage(searchResults[next]!);
  };

  const prevSearchResult = () => {
    if (!searchResults.length) return;
    const prev = (searchIdx - 1 + searchResults.length) % searchResults.length;
    setSearchIdx(prev);
    setCurrentPage(searchResults[prev]!);
  };

  return (
    <div
      className="flex flex-col items-center gap-5"
      onContextMenu={restrictDownload ? (e) => e.preventDefault() : undefined}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-sm sticky top-4 z-10 flex-wrap">
        <NavBtn
          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          disabled={currentPage <= 1}
          title="Previous page"
        >
          <ChevronLeft size={16} />
        </NavBtn>

        <span className="text-sm text-zinc-600 dark:text-zinc-300 min-w-[68px] text-center tabular-nums px-1">
          {loading ? "…" : `${currentPage} / ${numPages}`}
        </span>

        <NavBtn
          onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
          disabled={currentPage >= numPages}
          title="Next page"
        >
          <ChevronRight size={16} />
        </NavBtn>

        <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />

        <NavBtn
          onClick={() => setScale((s) => Math.max(0.5, parseFloat((s - 0.2).toFixed(1))))}
          disabled={scale <= 0.5}
          title="Zoom out"
        >
          <ZoomOut size={16} />
        </NavBtn>

        <span className="text-xs text-zinc-500 dark:text-zinc-400 w-9 text-center tabular-nums">
          {Math.round(scale * 100)}%
        </span>

        <NavBtn
          onClick={() => setScale((s) => Math.min(3, parseFloat((s + 0.2).toFixed(1))))}
          disabled={scale >= 3}
          title="Zoom in"
        >
          <ZoomIn size={16} />
        </NavBtn>

        <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />

        {/* Search toggle */}
        <NavBtn
          onClick={() => {
            setSearchOpen((v) => !v);
            setTimeout(() => searchInputRef.current?.focus(), 100);
          }}
          title="Search in document"
        >
          <Search size={15} />
        </NavBtn>

        {/* Download (only if not restricted) */}
        {!restrictDownload && (
          <NavBtn
            onClick={() => window.open(url, "_blank")}
            title="Download PDF"
          >
            <Download size={15} />
          </NavBtn>
        )}

        {filename && (
          <>
            <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />
            <span className="text-xs text-zinc-400 max-w-[140px] truncate px-1">{filename}</span>
          </>
        )}
      </div>

      {/* Search bar */}
      {searchOpen && (
        <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-sm w-full max-w-md">
          <Search size={14} className="text-zinc-400 shrink-0" />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
              if (e.key === "Escape") setSearchOpen(false);
            }}
            placeholder="Search in document…"
            className="flex-1 text-sm bg-transparent outline-none text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400"
          />
          {searchResults.length > 0 && (
            <span className="text-xs text-zinc-500 shrink-0">
              {searchIdx + 1}/{searchResults.length}
            </span>
          )}
          {searchResults.length > 1 && (
            <>
              <NavBtn onClick={prevSearchResult} title="Previous match">
                <ChevronLeft size={13} />
              </NavBtn>
              <NavBtn onClick={nextSearchResult} title="Next match">
                <ChevronRight size={13} />
              </NavBtn>
            </>
          )}
          {searchQuery && searchResults.length === 0 && (
            <span className="text-xs text-zinc-400">No matches</span>
          )}
          <NavBtn onClick={() => { setSearchOpen(false); setSearchQuery(""); setSearchResults([]); }} title="Close search">
            <X size={13} />
          </NavBtn>
        </div>
      )}

      {/* PDF canvas */}
      {loading && (
        <div className="flex items-center gap-3 text-zinc-400 py-16">
          <Spinner size="sm" />
          <span className="text-sm">Loading PDF…</span>
        </div>
      )}

      <Document
        file={url}
        onLoadSuccess={(pdf) => {
          onLoadSuccess(pdf);
          pdfDocRef.current = pdf;
        }}
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

      {/* Block print via CSS when restricted */}
      {restrictDownload && (
        <style>{`@media print { body { display: none !important; } }`}</style>
      )}
    </div>
  );
}
