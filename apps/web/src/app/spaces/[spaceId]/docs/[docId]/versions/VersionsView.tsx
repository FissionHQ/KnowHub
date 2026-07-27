"use client";

import useSWR from "swr";
import Link from "next/link";
import { documentsApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Document } from "@wiki/types";
import { DocumentVersionHistory } from "@/components/DocumentVersionHistory";
import { History, ChevronLeft } from "lucide-react";
import { Skeleton } from "@heroui/react";

interface Props {
  spaceId: string;
  docId: string;
}

export function VersionsView({ spaceId, docId }: Props) {
  const { user } = useAuth();
  const { data: doc } = useSWR<Document>(`doc:${docId}`, () => documentsApi.get(docId));
  const canEdit = Boolean(user && (user.role === "admin" || doc?.accessLevel === "edit"));

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <Link
        href={`/spaces/${spaceId}/docs/${docId}`}
        className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-[#f25011] transition-colors mb-6"
      >
        <ChevronLeft size={14} />
        Back to document
      </Link>

      <div className="flex items-center gap-2 mb-6">
        <History size={18} className="text-[#f25011]" />
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Version history</h1>
      </div>

      {!doc ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="w-full h-10 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden">
          <DocumentVersionHistory
            documentId={docId}
            currentVersion={doc.version}
            canEdit={canEdit}
            defaultOpen
          />
        </div>
      )}
    </div>
  );
}
