"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { attachmentsApi } from "@/lib/api";
import type { DocumentListItem } from "@wiki/types";
import type { PreviewCacheEntry, ProcessingStatus } from "./types";

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 90;

const previewCache = new Map<string, PreviewCacheEntry>();

export function useDocumentPreview(doc: DocumentListItem | null) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<ProcessingStatus>("idle");
  const [attachmentId, setAttachmentId] = useState<string | undefined>();
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollAttemptsRef = useRef(0);

  const loadPreview = useCallback(async (target: DocumentListItem) => {
    if (target.type !== "pdf") {
      setPdfUrl(null);
      setStatus("ready");
      setAttachmentId(undefined);
      return;
    }

    const cached = previewCache.get(target.id);
    if (cached?.status === "ready" && cached.pdfUrl) {
      setPdfUrl(cached.pdfUrl);
      setStatus("ready");
      setAttachmentId(cached.attachmentId);
      return;
    }

    setStatus("processing");
    setPdfUrl(null);

    const poll = async () => {
      try {
        const atts = await attachmentsApi.listByDocument(target.id);
        const att = atts[0];

        if (!att) {
          if (pollAttemptsRef.current >= MAX_POLL_ATTEMPTS) {
            setStatus("error");
            return;
          }
          pollAttemptsRef.current += 1;
          pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
          return;
        }

        if (att.scanStatus === "clean" && att.s3Key) {
          const { url } = await attachmentsApi.getViewUrl(att.id);
          const entry: PreviewCacheEntry = {
            pdfUrl: url,
            status: "ready",
            attachmentId: att.id,
          };
          previewCache.set(target.id, entry);
          setPdfUrl(url);
          setStatus("ready");
          setAttachmentId(att.id);
          return;
        }

        if (att.scanStatus === "error") {
          setStatus("error");
          previewCache.set(target.id, { pdfUrl: null, status: "error", attachmentId: att.id });
          return;
        }

        if (pollAttemptsRef.current >= MAX_POLL_ATTEMPTS) {
          setStatus("error");
          return;
        }

        pollAttemptsRef.current += 1;
        pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      } catch {
        setStatus("error");
      }
    };

    pollAttemptsRef.current = 0;
    poll();
  }, []);

  useEffect(() => {
    if (!doc) {
      setPdfUrl(null);
      setStatus("idle");
      setAttachmentId(undefined);
      return;
    }

    loadPreview(doc);

    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [doc?.id, doc?.type, loadPreview]);

  return { pdfUrl, status, attachmentId };
}

export function clearPreviewCache(documentId: string) {
  previewCache.delete(documentId);
}
