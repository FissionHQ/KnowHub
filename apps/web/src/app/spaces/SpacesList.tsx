"use client";

import { useRef, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { spacesApi, activityApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Space, Document } from "@wiki/types";
import { Card, CardContent, Skeleton } from "@heroui/react";
import { ArrowRight, MoreVertical, Upload, Clock, RefreshCw } from "lucide-react";
import { importDocumentFile } from "@/lib/importDocument";

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

  async function handleFileUpload(spaceId: string, file: File) {
    setUploading(spaceId);
    setMenuOpen(null);
    try {
      const doc = await importDocumentFile(spaceId, file);
      router.push(`/spaces/${spaceId}/docs/${doc.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to import file");
    } finally {
      setUploading(null);
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
        <CardContent className="py-16 flex flex-col items-center gap-3 text-zinc-400 p-5">
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
                  <Clock size={14} className="text-zinc-400" />
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Recently viewed</h2>
                </div>
                <div className="flex flex-col gap-1">
                  {recentDocs.slice(0, 5).map((doc) => (
                    <Link
                      key={doc.id}
                      href={`/spaces/${doc.spaceId}/docs/${doc.id}`}
                      className="text-sm text-zinc-600 dark:text-zinc-300 hover:text-[#f25011] truncate py-1"
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
                  <RefreshCw size={14} className="text-zinc-400" />
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Recently updated</h2>
                </div>
                <div className="flex flex-col gap-1">
                  {recentlyUpdated.slice(0, 5).map((doc) => (
                    <Link
                      key={doc.id}
                      href={`/spaces/${doc.spaceId}/docs/${doc.id}`}
                      className="text-sm text-zinc-600 dark:text-zinc-300 hover:text-[#f25011] truncate py-1"
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
            <Link href={`/spaces/${space.id}`} className="block">
              <Card className="h-full transition-all duration-200 hover:shadow-md hover:border-[#f25011]/30 cursor-pointer">
                <CardContent className="p-5 flex flex-col gap-3 h-full">
                  <div className="flex items-start justify-between">
                    <span className="text-3xl">{space.iconEmoji ?? "📄"}</span>
                    <ArrowRight
                      size={16}
                      className="text-zinc-300 group-hover:text-[#f25011] group-hover:translate-x-0.5 transition-all mt-1"
                    />
                  </div>
                  <div>
                    <h2 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm leading-snug truncate">
                      {space.name}
                    </h2>
                    {space.description && (
                      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">{space.description}</p>
                    )}
                  </div>
                  {uploading === space.id && (
                    <p className="text-xs text-[#f25011] animate-pulse mt-auto">Importing…</p>
                  )}
                </CardContent>
              </Card>
            </Link>

            {/* 3-dot menu button */}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpen(menuOpen === space.id ? null : space.id);
              }}
              className="absolute top-3 right-3 p-1.5 rounded-lg bg-white/80 dark:bg-zinc-800/80 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 opacity-0 group-hover:opacity-100 transition-all shadow-sm border border-zinc-200 dark:border-zinc-700 z-10"
              title="More options"
            >
              <MoreVertical size={14} />
            </button>

            {/* Dropdown menu */}
            {menuOpen === space.id && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(null)} />
                <div className="absolute top-10 right-3 z-30 w-44 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg py-1 text-[13px]">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMenuOpen(null);
                      openFilePicker(space.id);
                    }}
                    className="w-full text-left px-3 py-2 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-2"
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
    </>
  );
}
