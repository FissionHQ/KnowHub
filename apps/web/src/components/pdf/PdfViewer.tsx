"use client";

import { useState, useCallback, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Spinner } from "@heroui/react";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Search } from "lucide-react";
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatches, setSearchMatches] = useState<number[]>([]);
  const [matchIndex, setMatchIndex] = useState(0);

  const onLoadSuccess = useCallback((pdf: unknown) => {
    const doc = pdf as { numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: unknown[] }> }> };
    setNumPages(doc.numPages);
    setPdfDoc(doc);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!pdfDoc || !searchQuery.trim()) {
      setSearchMatches([]);
      setMatchIndex(0);
      return;
    }

    let cancelled = false;

    async function searchPdf() {
      const matches: number[] = [];
      const query = searchQuery.toLowerCase();

      for (let i = 1; i <= pdfDoc!.numPages; i++) {
        const page = await pdfDoc!.getPage(i);
        const content = await page.getTextContent();
        const text = content.items
          .map((item: unknown) => (typeof item === "object" && item !== null && "str" in item ? String((item as { str: string }).str) : ""))
          .join(" ")
          .toLowerCase();
        if (text.includes(query)) matches.push(i);
      }

      if (!cancelled) {
        setSearchMatches(matches);
        setMatchIndex(0);
        if (matches.length > 0) setCurrentPage(matches[0]!);
      }
    }

    const timer = setTimeout(searchPdf, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pdfDoc, searchQuery]);

  function goToNextMatch() {
    if (searchMatches.length === 0) return;
    const next = (matchIndex + 1) % searchMatches.length;
    setMatchIndex(next);
    setCurrentPage(searchMatches[next]!);
  }

  return (
    <div className="flex flex-col items-center gap-5 w-full">
      <div className="flex items-center gap-1 px-3 py-2 bg-white border border-zinc-200 rounded-xl shadow-sm sticky top-4 z-10 flex-wrap">
        <NavBtn onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}>
          <ChevronLeft size={16} />
        </NavBtn>

        <span className="text-sm text-zinc-600 min-w-[68px] text-center tabular-nums px-1">
          {loading ? "…" : `${currentPage} / ${numPages}`}
        </span>

        <NavBtn onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))} disabled={currentPage >= numPages}>
          <ChevronRight size={16} />
        </NavBtn>

        <div className="w-px h-4 bg-zinc-200 mx-1" />

        <NavBtn onClick={() => setScale((s) => Math.max(0.5, parseFloat((s - 0.2).toFixed(1))))} disabled={scale <= 0.5}>
          <ZoomOut size={16} />
        </NavBtn>

        <span className="text-xs text-zinc-500 w-9 text-center tabular-nums">
          {Math.round(scale * 100)}%
        </span>

        <NavBtn onClick={() => setScale((s) => Math.min(3, parseFloat((s + 0.2).toFixed(1))))} disabled={scale >= 3}>
          <ZoomIn size={16} />
        </NavBtn>

        <div className="w-px h-4 bg-zinc-200 mx-1" />

        <div className="flex items-center gap-1">
          <Search size={14} className="text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search in PDF…"
            className="text-xs border border-zinc-200 rounded-md px-2 py-1 w-36 outline-none focus:border-violet-400"
          />
          {searchMatches.length > 0 && (
            <button
              type="button"
              onClick={goToNextMatch}
              className="text-xs text-violet-600 px-1.5 py-0.5 hover:bg-violet-50 rounded"
            >
              {matchIndex + 1}/{searchMatches.length}
            </button>
          )}
        </div>

        {filename && (
          <>
            <div className="w-px h-4 bg-zinc-200 mx-1" />
            <span className="text-xs text-zinc-400 max-w-[140px] truncate px-1">{filename}</span>
          </>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-3 text-zinc-400 py-16">
          <Spinner size="sm" />
          <span className="text-sm">Loading PDF…</span>
        </div>
      )}

      <Document
        file={url}
        onLoadSuccess={onLoadSuccess}
        onLoadError={(err) => {
          console.error("PDF load error:", err);
          setLoading(false);
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
    </div>
  );
}
