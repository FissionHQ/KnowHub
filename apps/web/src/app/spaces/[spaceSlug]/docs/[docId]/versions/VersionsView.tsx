"use client";

import useSWR from "swr";
import Link from "next/link";
import { documentsApi, spacesApi } from "@/lib/api";
import { spaceDocPath } from "@/lib/spacePath";
import { useAuth } from "@/lib/auth";
import type { Document, Space } from "@wiki/types";
import { DocumentVersionHistory } from "@/components/DocumentVersionHistory";
import { History, ChevronLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  spaceSlug: string;
  docId: string;
}

export function VersionsView({ spaceSlug, docId }: Props) {
  const { user } = useAuth();
  const { data: space } = useSWR<Space>(`space:${spaceSlug}`, () => spacesApi.get(spaceSlug));
  const { data: doc } = useSWR<Document>(`doc:${docId}`, () => documentsApi.get(docId));
  const canEdit = Boolean(user && (user.role === "admin" || doc?.accessLevel === "edit"));

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <Link
        href={(space ? spaceDocPath(space, docId) : `/spaces/${spaceSlug}/docs/${docId}`) as never}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors mb-6"
      >
        <ChevronLeft size={14} />
        Back to document
      </Link>

      <div className="flex items-center gap-2 mb-6">
        <History size={18} className="text-primary" />
        <h1 className="text-xl font-bold text-foreground">Version history</h1>
      </div>

      {!doc ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="w-full h-10 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
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
