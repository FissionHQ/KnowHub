"use client";

import { useRef, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { spacesApi, activityApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Space, Document } from "@wiki/types";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, MoreVertical, Upload, Clock, RefreshCw } from "lucide-react";
import { importDocumentFile, importPdfAsViewer } from "@/lib/importDocument";
import { PdfImportModal } from "@/components/PdfImportModal";
import { spacePath } from "@/lib/spacePath";

export function SpacesList() {
  const router = useRouter();
  const { user } = useAuth();
  const { data: spaces, isLoading, error } = useSWR<Space[]>("spaces", spacesApi.list);
  const { data: recentDocs = [] } = useSWR<Document[]>(user ? "recent" : null, activityApi.getRecent);
  const { data: recentlyUpdated = [] } = useSWR<Document[]>(
    user ? "recently-updated" : null,
    activityApi.getRecentlyUpdated,
  );
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadSpaceRef = useRef<string>("");
  const [pdfModalFile, setPdfModalFile] = useState<File | null>(null);
  const [pdfModalSpaceId, setPdfModalSpaceId] = useState<string>("");
  const slugById = Object.fromEntries((spaces ?? []).map((s) => [s.id, s.slug]));

  async function handleFileUpload(spaceId: string, file: File) {
    if (file.name.toLowerCase().endsWith(".pdf")) {
      setPdfModalSpaceId(spaceId);
      setPdfModalFile(file);
      setMenuOpen(null);
      return;
    }
    setUploading(spaceId);
    setMenuOpen(null);
    try {
      const doc = await importDocumentFile(spaceId, file);
      const slug = slugById[spaceId] ?? spaceId;
      router.push(`/spaces/${slug}/docs/${doc.slug}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to import file");
    } finally {
      setUploading(null);
    }
  }

  async function handlePdfConvert() {
    if (!pdfModalFile) return;
    const spaceId = pdfModalSpaceId;
    const file = pdfModalFile;
    setPdfModalFile(null);
    try {
      const doc = await importDocumentFile(spaceId, file);
      router.push(`/spaces/${spaceId}/docs/${doc.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to import file");
    }
  }

  async function handlePdfAttach() {
    if (!pdfModalFile) return;
    const spaceId = pdfModalSpaceId;
    const file = pdfModalFile;
    setPdfModalFile(null);
    try {
      const doc = await importPdfAsViewer(spaceId, file);
      router.push(`/spaces/${spaceId}/docs/${doc.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to import file");
    }
  }

  function openFilePicker(spaceId: string) {
    uploadSpaceRef.current = spaceId;
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && uploadSpaceRef.current) {
      handleFileUpload(uploadSpaceRef.current, file);
    }
    e.target.value = "";
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="h-28">
            <CardContent className="flex flex-col gap-3 p-5">
              <Skeleton className="w-10 h-10 rounded-xl" />
              <Skeleton className="w-3/4 h-4 rounded-md" />
              <Skeleton className="w-1/2 h-3 rounded-md" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-100 bg-red-50">
        <CardContent className="p-4 text-red-600 text-sm">Failed to load spaces.</CardContent>
      </Card>
    );
  }

  if (!spaces?.length) {
    return (
      <Card>
        <CardContent className="py-16 flex flex-col items-center gap-3 text-muted-foreground p-5">
          <span className="text-4xl">🌌</span>
          <p className="text-sm">No spaces yet. Ask an admin to create one.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt,.md"
        className="hidden"
        onChange={handleFileChange}
      />

      {(recentDocs.length > 0 || recentlyUpdated.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {recentDocs.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Clock size={14} className="text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-foreground">Recently viewed</h2>
                </div>
                <div className="flex flex-col gap-1">
                  {recentDocs.slice(0, 5).map((doc) => (
                    <Link
                      key={doc.id}
                      href={`/spaces/${slugById[doc.spaceId] ?? doc.spaceId}/docs/${doc.slug}`}
                      className="text-sm text-muted-foreground hover:text-primary truncate py-1"
                    >
                      {doc.title}
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          {recentlyUpdated.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <RefreshCw size={14} className="text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-foreground">Recently updated</h2>
                </div>
                <div className="flex flex-col gap-1">
                  {recentlyUpdated.slice(0, 5).map((doc) => (
                    <Link
                      key={doc.id}
                      href={`/spaces/${slugById[doc.spaceId] ?? doc.spaceId}/docs/${doc.slug}`}
                      className="text-sm text-muted-foreground hover:text-primary truncate py-1"
                    >
                      {doc.title}
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {spaces.map((space) => (
          <div key={space.id} className="relative group">
            <Link href={spacePath(space)} className="block">
              <Card className="h-full transition-all duration-200 hover:shadow-md hover:border-primary/30 cursor-pointer">
                <CardContent className="p-5 flex flex-col gap-3 h-full">
                  <div className="flex items-start justify-between">
                    <ArrowRight
                      size={16}
                      className="text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all mt-1"
                    />
                  </div>
                  <div>
                    <h2 className="font-semibold text-foreground text-sm leading-snug truncate">
                      {space.name}
                    </h2>
                    {space.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{space.description}</p>
                    )}
                  </div>
                  {uploading === space.id && (
                    <p className="text-xs text-primary animate-pulse mt-auto">Importing…</p>
                  )}
                </CardContent>
              </Card>
            </Link>

            {/* 3-dot menu button */}
            {space.accessLevel === "edit" && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpen(menuOpen === space.id ? null : space.id);
              }}
              className="absolute top-3 right-3 p-1.5 rounded-lg bg-card/80 text-muted-foreground hover:text-foreground/80 dark:hover:text-sidebar-foreground hover:bg-muted dark:hover:bg-accent opacity-0 group-hover:opacity-100 transition-all shadow-sm border border-border z-10"
              title="More options"
            >
              <MoreVertical size={14} />
            </button>
            )}

            {/* Dropdown menu */}
            {menuOpen === space.id && space.accessLevel === "edit" && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(null)} />
                <div className="absolute top-10 right-3 z-30 w-44 bg-card border border-border rounded-lg shadow-lg py-1 text-[13px]">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMenuOpen(null);
                      openFilePicker(space.id);
                    }}
                    className="w-full text-left px-3 py-2 text-foreground/80 hover:bg-muted dark:hover:bg-accent transition-colors flex items-center gap-2"
                  >
                    <Upload size={14} />
                    Import document
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {pdfModalFile && typeof window !== "undefined" && (
        <PdfImportModal
          fileName={pdfModalFile.name}
          onConvert={() => { void handlePdfConvert(); }}
          onAttach={() => { void handlePdfAttach(); }}
          onCancel={() => setPdfModalFile(null)}
        />
      )}
    </>
  );
}
