"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import useSWR from "swr";
import Link from "next/link";
import { documentsApi, attachmentsApi, spacesApi } from "@/lib/api";
import type { Document, Space } from "@wiki/types";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { PdfViewer } from "@/components/pdf/PdfViewer";
import { DocumentPermissionsPanel } from "@/components/DocumentPermissionsPanel";
import { VersionHistoryPanel } from "@/components/editor/VersionHistoryPanel";
import { Chip, Skeleton, Card, CardContent, Button } from "@heroui/react";
import { CheckCircle2, Clock, AlertCircle, Eye, EyeOff } from "lucide-react";

type SaveStatus = "saved" | "saving" | "unsaved";
type PdfStatus = "idle" | "processing" | "ready" | "error";

interface Props { spaceId: string; docId: string }

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 90; // ~3 minutes

export function DocumentView({ spaceId, docId }: Props) {
  const { data: doc, mutate } = useSWR<Document>(
    `doc:${docId}`,
    () => documentsApi.get(docId),
  );
  const { data: space } = useSWR<Space>(
    `space:${spaceId}`,
    () => spacesApi.get(spaceId),
  );

  const [content, setContent] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfStatus, setPdfStatus] = useState<PdfStatus>("idle");
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollAttemptsRef = useRef(0);

  useEffect(() => {
    if (doc) {
      if (content === "" && doc.contentRef) setContent(doc.contentRef);
      if (title === "" && doc.title) setTitle(doc.title);
    }
  }, [doc, content, title]);

  useEffect(() => {
    if (doc?.type !== "pdf" || pdfUrl || pdfStatus === "ready" || pdfStatus === "error") {
      return;
    }

    let cancelled = false;

    async function poll() {
      if (cancelled || !doc) return;

      setPdfStatus("processing");
      try {
        const atts = await attachmentsApi.listByDocument(doc.id);
        const att = atts[0];

        if (!att) {
          if (pollAttemptsRef.current >= MAX_POLL_ATTEMPTS) {
            setPdfStatus("error");
            return;
          }
          pollAttemptsRef.current += 1;
          pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
          return;
        }

        if (att.scanStatus === "clean" && att.s3Key) {
          const { url } = await attachmentsApi.getViewUrl(att.id);
          if (!cancelled) {
            setPdfUrl(url);
            setPdfStatus("ready");
          }
          return;
        }

        if (att.scanStatus === "error") {
          if (!cancelled) setPdfStatus("error");
          return;
        }

        if (pollAttemptsRef.current >= MAX_POLL_ATTEMPTS) {
          if (!cancelled) setPdfStatus("error");
          return;
        }

        pollAttemptsRef.current += 1;
        pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      } catch {
        if (!cancelled) setPdfStatus("error");
      }
    }

    pollAttemptsRef.current = 0;
    poll();

    return () => {
      cancelled = true;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [doc, pdfUrl, pdfStatus]);

  const handleAutoSave = useCallback(
    async (html: string) => {
      if (!doc) return;
      setSaveStatus("saving");
      try {
        await documentsApi.update(docId, {
          content: html,
          ...(title !== doc.title ? { title } : {}),
        });
        setSaveStatus("saved");
        mutate();
      } catch {
        setSaveStatus("unsaved");
      }
    },
    [doc, docId, mutate, title],
  );

  const togglePublish = useCallback(async () => {
    if (!doc) return;
    const newStatus = doc.status === "published" ? "draft" : "published";
    await documentsApi.update(docId, { status: newStatus });
    mutate();
  }, [doc, docId, mutate]);

  if (!doc) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-4">
        <Skeleton className="w-1/3 h-4 rounded-md" />
        <Skeleton className="w-2/3 h-8 rounded-xl" />
        <Skeleton className="w-full h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <nav
        aria-label="Breadcrumb"
        className="text-xs text-zinc-400 mb-5 flex items-center gap-1.5 flex-wrap"
      >
        <Link href="/spaces" className="hover:text-violet-600 transition-colors">Spaces</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/spaces/${spaceId}`} className="text-zinc-500 hover:text-violet-600 transition-colors truncate max-w-[160px]">
          {space?.name ?? "Space"}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-zinc-700 dark:text-zinc-200 font-medium truncate max-w-[240px]">{doc.title}</span>
      </nav>

      <div className="flex items-start gap-3 mb-4">
        {doc.type === "page" ? (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              if (title !== doc.title) {
                documentsApi.update(docId, { title }).then(() => mutate());
              }
            }}
            className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 flex-1 leading-tight bg-transparent border-none outline-none"
          />
        ) : (
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 flex-1 leading-tight">{doc.title}</h1>
        )}
        <div className="flex items-center gap-2 shrink-0 mt-1">
          {doc.type === "page" && (
            <>
              <Button size="sm" variant="secondary" onClick={togglePublish} className="flex items-center gap-1 text-xs">
                {doc.status === "published" ? <Eye size={12} /> : <EyeOff size={12} />}
                {doc.status === "published" ? "Published" : "Draft"}
              </Button>
              <SaveIndicator status={saveStatus} />
            </>
          )}
          {doc.status === "draft" && doc.type === "pdf" && (
            <Chip size="sm" color="warning" variant="soft">Draft</Chip>
          )}
        </div>
      </div>

      {doc.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-5">
          {doc.tags.map((tag) => (
            <Chip key={tag} size="sm" variant="secondary" className="text-xs">{tag}</Chip>
          ))}
        </div>
      )}

      {doc.type === "page" && (
        <VersionHistoryPanel
          documentId={docId}
          onRestore={(restored) => {
            setContent(restored);
            mutate();
          }}
        />
      )}

      <DocumentPermissionsPanel documentId={docId} />

      {doc.type === "pdf" ? (
        pdfUrl ? (
          <PdfViewer url={pdfUrl} filename={doc.title} />
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center p-5">
              {pdfStatus === "error" ? (
                <>
                  <AlertCircle size={24} className="text-red-500" />
                  <p className="text-sm text-red-600 font-medium">PDF processing failed</p>
                  <p className="text-xs text-zinc-400 max-w-sm">
                    The file could not be scanned or stored. Try uploading the PDF again.
                  </p>
                  <Link href={`/spaces/${spaceId}`}>
                    <Button variant="secondary" size="sm" className="mt-2">Back to space</Button>
                  </Link>
                </>
              ) : (
                <>
                  <Clock size={18} className="text-zinc-400 animate-pulse" />
                  <p className="text-sm text-zinc-500">
                    {pdfStatus === "processing" ? "PDF is being processed…" : "Loading PDF…"}
                  </p>
                  <p className="text-xs text-zinc-400">This usually takes a few seconds</p>
                </>
              )}
            </CardContent>
          </Card>
        )
      ) : (
        <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
          <RichTextEditor
            content={content}
            onChange={setContent}
            onAutoSave={handleAutoSave}
          />
        </div>
      )}
    </div>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
        <CheckCircle2 size={11} /> Saved
      </span>
    );
  }
  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-50 px-2.5 py-1 rounded-full animate-pulse">
        Saving…
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">
      <AlertCircle size={11} /> Unsaved
    </span>
  );
}
