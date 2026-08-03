"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  SlideCanvas,
  useViewerBuildingBlocks,
  ViewerThemeProvider,
  vermilionLightTheme,
  type PowerPointViewerHandle,
} from "pptx-react-viewer";
import i18n from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { keyToLabel, translationsEn } from "pptx-react-viewer/i18n";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { extractPptSlides } from "@/lib/importers/pptImporter";
import { PptxIsolatedShell } from "./PptxIsolatedShell";

interface Props {
  url: string;
  filename?: string;
  restrictDownload?: boolean;
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

let pptxI18n: typeof i18n | null = null;

function getPptxI18n() {
  if (pptxI18n) return pptxI18n;
  pptxI18n = i18n.createInstance();
  void pptxI18n.use(initReactI18next).init({
    lng: "en",
    fallbackLng: "en",
    resources: { en: { translation: translationsEn as Record<string, string> } },
    parseMissingKeyHandler: keyToLabel,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
  return pptxI18n;
}

/** Slides only — SlideCanvas, no PowerPointViewer / Toolbar / ribbon. */
function PptxSlidesEmbed({ content }: { content: Uint8Array }) {
  const handleRef = useRef<PowerPointViewerHandle>(null);
  const [slideIndex, setSlideIndex] = useState(0);
  const [slideCount, setSlideCount] = useState(0);

  const { canvasProps, loading, error } = useViewerBuildingBlocks({
    content,
    canEdit: false,
    autosaveEnabled: false,
    handle: handleRef,
    onActiveSlideChange: setSlideIndex,
    onSlideCountChange: setSlideCount,
  });

  useEffect(() => {
    if (loading) return;
    handleRef.current?.setMode("preview");
  }, [loading]);

  // Strip editor chrome that building-blocks may still enable by default.
  const slideOnlyProps = {
    ...canvasProps,
    canEdit: false as const,
    mode: "preview" as const,
    showRulers: false,
    showGrid: false,
    showCommentMarkers: false,
    selectedElementIdSet: new Set<string>(),
    selectedElement: null,
    snapLines: [] as typeof canvasProps.snapLines,
    guides: [] as typeof canvasProps.guides,
  };

  return (
    <div className="flex w-full flex-col">
      <div className="flex items-center justify-center gap-3 border-b border-border px-3 py-2">
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
          disabled={loading || slideIndex <= 0}
          onClick={() => handleRef.current?.goPrev()}
          title="Previous slide"
          aria-label="Previous slide"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="min-w-[4.5rem] text-center text-xs tabular-nums text-muted-foreground">
          {loading ? "…" : `${slideIndex + 1} / ${Math.max(slideCount, 1)}`}
        </span>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
          disabled={loading || slideCount === 0 || slideIndex >= slideCount - 1}
          onClick={() => handleRef.current?.goNext()}
          title="Next slide"
          aria-label="Next slide"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <PptxIsolatedShell className="h-[min(75vh,800px)] min-h-[520px] w-full">
        <ViewerThemeProvider theme={vermilionLightTheme}>
          <div className="relative h-full w-full bg-[#525252]">
            {(loading || error) && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 text-sm">
                {loading ? "Loading slides…" : error}
              </div>
            )}
            {!loading && !error && <SlideCanvas {...slideOnlyProps} />}
          </div>
        </ViewerThemeProvider>
      </PptxIsolatedShell>
    </div>
  );
}

export function PptxViewer({ url, filename, restrictDownload = false }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [legacySlides, setLegacySlides] = useState<string[][] | null>(null);
  const [legacyIndex, setLegacyIndex] = useState(0);
  const [pptxBytes, setPptxBytes] = useState<Uint8Array | null>(null);
  const i18nInstance = useMemo(() => getPptxI18n(), []);

  useEffect(() => {
    let cancelled = false;

    async function showLegacy(buffer: ArrayBuffer) {
      const slides = await extractPptSlides(buffer);
      if (cancelled) return;
      if (!slides.length) throw new Error("No slides found in this .ppt file");
      setLegacySlides(slides);
      setPptxBytes(null);
      setLegacyIndex(0);
      setLoading(false);
    }

    async function load() {
      setLoading(true);
      setError(null);
      setLegacySlides(null);
      setPptxBytes(null);
      setLegacyIndex(0);

      try {
        if (isLegacyPptName(filename)) {
          const res = await fetch(url);
          if (!res.ok) throw new Error("Failed to download presentation");
          await showLegacy(await res.arrayBuffer());
          return;
        }

        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to download presentation");
        const buffer = await res.arrayBuffer();
        if (!looksLikeZip(buffer)) {
          await showLegacy(buffer);
          return;
        }

        if (cancelled) return;
        setPptxBytes(new Uint8Array(buffer));
        setLoading(false);
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
    };
  }, [url, filename]);

  const downloadName = filename
    ? filename.toLowerCase().endsWith(".ppt") || filename.toLowerCase().endsWith(".pptx")
      ? filename
      : `${filename}.pptx`
    : "presentation.pptx";

  return (
    <div className="flex w-full flex-col gap-3">
      {!restrictDownload && (
        <div className="flex justify-end px-1">
          <a
            href={url}
            download={downloadName}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Download"
          >
            <Download size={14} />
            Download
          </a>
        </div>
      )}

      {legacySlides && (
        <p className="px-1 text-xs text-muted-foreground">
          Legacy .ppt files are shown as text only (no colors, images, or fonts). For a visual
          preview matching the original, re-save as .pptx and import again — or download the file.
        </p>
      )}

      <div className="relative w-full overflow-hidden rounded-xl border border-border bg-background">
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
          <div className="flex min-h-[560px] w-full flex-col justify-center bg-card p-8 md:p-12">
            <div className="mb-4 flex items-center gap-2">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
                disabled={legacyIndex <= 0}
                onClick={() => setLegacyIndex((i) => Math.max(0, i - 1))}
              >
                Previous
              </button>
              <span className="text-xs tabular-nums text-muted-foreground">
                {legacyIndex + 1} / {legacySlides.length}
              </span>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
                disabled={legacyIndex >= legacySlides.length - 1}
                onClick={() =>
                  setLegacyIndex((i) => Math.min(legacySlides.length - 1, i + 1))
                }
              >
                Next
              </button>
            </div>
            <div className="max-w-3xl space-y-3">
              {(legacySlides[legacyIndex] ?? []).map((line, i) => (
                <p key={i} className="whitespace-pre-wrap text-lg leading-relaxed text-foreground">
                  {line}
                </p>
              ))}
              {(legacySlides[legacyIndex] ?? []).length === 0 && (
                <p className="text-sm italic text-muted-foreground">No text on this slide.</p>
              )}
            </div>
          </div>
        ) : (
          pptxBytes && (
            <I18nextProvider i18n={i18nInstance}>
              <PptxSlidesEmbed content={pptxBytes} />
            </I18nextProvider>
          )
        )}
      </div>
    </div>
  );
}
