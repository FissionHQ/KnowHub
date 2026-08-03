"use client";

import { useEffect, useRef, useState } from "react";
import { PPTXViewer } from "pptx-viewer";
import { Spinner } from "@/components/ui/spinner";
import { ChevronLeft, ChevronRight, Download, Maximize2 } from "lucide-react";
import clsx from "clsx";
import { extractPptSlides } from "@/lib/importers/pptImporter";

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
          ? "text-muted-foreground cursor-not-allowed"
          : "text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

function isLegacyPptName(name?: string): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  return lower.endsWith(".ppt") && !lower.endsWith(".pptx");
}

function looksLikeZip(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer);
  return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

export function PptxViewer({ url, filename, restrictDownload = false }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PPTXViewer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [slideCount, setSlideCount] = useState(0);
  const [current, setCurrent] = useState(0);
  const [legacySlides, setLegacySlides] = useState<string[][] | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function showLegacy(buffer: ArrayBuffer) {
      const slides = await extractPptSlides(buffer);
      if (cancelled) return;
      if (!slides.length) throw new Error("No slides found in this .ppt file");
      setLegacySlides(slides);
      setSlideCount(slides.length);
      setCurrent(0);
      setLoading(false);
    }

    async function load() {
      setLoading(true);
      setError(null);
      setLegacySlides(null);
      setCurrent(0);
      setSlideCount(0);

      try {
        if (isLegacyPptName(filename)) {
          const res = await fetch(url);
          if (!res.ok) throw new Error("Failed to download presentation");
          await showLegacy(await res.arrayBuffer());
          return;
        }

        // Peek at bytes: OLE .ppt mislabeled as pptx, or real OOXML.
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to download presentation");
        const buffer = await res.arrayBuffer();
        if (!looksLikeZip(buffer)) {
          await showLegacy(buffer);
          return;
        }

        const host = hostRef.current;
        if (!host) return;
        const blobUrl = URL.createObjectURL(new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        }));
        const viewer = new PPTXViewer(host, { showControls: false });
        viewerRef.current = viewer;
        try {
          await viewer.load(blobUrl);
          if (cancelled) return;
          setSlideCount(viewer.getSlideCount());
          setCurrent(viewer.getCurrentSlide());
          setLoading(false);
        } finally {
          URL.revokeObjectURL(blobUrl);
        }
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Failed to load presentation";
        setError(
          message === "n" || message.includes("find is not a function")
            ? "Could not parse this .ppt file. Try re-saving it as .pptx and importing again."
            : message,
        );
        setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, [url, filename]);

  function goPrev() {
    if (legacySlides) {
      setCurrent((c) => Math.max(0, c - 1));
      return;
    }
    const viewer = viewerRef.current;
    if (!viewer) return;
    const next = viewer.previous();
    if (next >= 0) setCurrent(next);
  }

  function goNext() {
    if (legacySlides) {
      setCurrent((c) => Math.min(slideCount - 1, c + 1));
      return;
    }
    const viewer = viewerRef.current;
    if (!viewer) return;
    const next = viewer.next();
    if (next >= 0) setCurrent(next);
  }

  async function handleFullscreen() {
    if (legacySlides) {
      await hostRef.current?.requestFullscreen?.();
      return;
    }
    await viewerRef.current?.enterFullscreen();
  }

  const downloadName = filename
    ? filename.toLowerCase().endsWith(".ppt") || filename.toLowerCase().endsWith(".pptx")
      ? filename
      : `${filename}.pptx`
    : "presentation.pptx";

  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-1">
          <NavBtn onClick={goPrev} disabled={loading || current <= 0} title="Previous slide">
            <ChevronLeft size={16} />
          </NavBtn>
          <span className="text-xs text-muted-foreground tabular-nums min-w-[4.5rem] text-center">
            {slideCount ? `${current + 1} / ${slideCount}` : "—"}
          </span>
          <NavBtn
            onClick={goNext}
            disabled={loading || current >= slideCount - 1}
            title="Next slide"
          >
            <ChevronRight size={16} />
          </NavBtn>
        </div>
        <div className="flex items-center gap-1">
          <NavBtn onClick={() => void handleFullscreen()} disabled={loading || Boolean(error)} title="Fullscreen">
            <Maximize2 size={16} />
          </NavBtn>
          {!restrictDownload && (
            <a
              href={url}
              download={downloadName}
              className="p-1.5 rounded-md text-muted-foreground hover:bg-accent transition-colors"
              title="Download"
            >
              <Download size={16} />
            </a>
          )}
        </div>
      </div>

      {legacySlides && (
        <p className="text-xs text-muted-foreground px-1">
          Legacy .ppt files are shown as text only (no colors, images, or fonts). For a visual
          preview matching the original, re-save as .pptx and import again — or download the file.
        </p>
      )}

      <div className="relative w-full min-h-[480px] rounded-xl border border-border bg-muted/30 overflow-hidden">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/60">
            <Spinner className="size-6" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-6 text-center">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}
        {legacySlides ? (
          <div
            ref={hostRef}
            className="w-full min-h-[560px] p-8 md:p-12 bg-card flex flex-col justify-center"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">
              Slide {current + 1}
            </p>
            <div className="space-y-3 max-w-3xl">
              {(legacySlides[current] ?? []).map((line, i) => (
                <p key={i} className="text-lg text-foreground leading-relaxed whitespace-pre-wrap">
                  {line}
                </p>
              ))}
              {(legacySlides[current] ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground italic">No text on this slide.</p>
              )}
            </div>
          </div>
        ) : (
          <div ref={hostRef} className="w-full h-[560px] [&_svg]:max-w-full [&_svg]:h-auto" />
        )}
      </div>
    </div>
  );
}
