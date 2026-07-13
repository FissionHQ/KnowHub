"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { DocumentListItem } from "@wiki/types";
import { useResizableDrawerWidth } from "./useResizableDrawerWidth";

interface DocumentDrawerContextValue {
  selectedId: string | null;
  selectedDoc: DocumentListItem | null;
  isOpen: boolean;
  openDocument: (doc: DocumentListItem) => void;
  closeDrawer: () => void;
  setSelectedDoc: (doc: DocumentListItem | null) => void;
  drawerWidth: number;
  isResizing: boolean;
  isMobileDrawer: boolean;
  resizeHandleProps: {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void;
  };
}

const DocumentDrawerContext = createContext<DocumentDrawerContextValue | null>(null);

export function DocumentDrawerProvider({
  children,
  documents,
}: {
  children: ReactNode;
  documents: DocumentListItem[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlDocId = searchParams.get("doc");

  const selectedFromUrl = useMemo(
    () => (urlDocId ? documents.find((d) => d.id === urlDocId) ?? null : null),
    [documents, urlDocId],
  );

  const [selectedDoc, setSelectedDoc] = useState<DocumentListItem | null>(null);

  useEffect(() => {
    if (selectedFromUrl) setSelectedDoc(selectedFromUrl);
  }, [selectedFromUrl?.id]);

  const activeDoc = selectedDoc ?? selectedFromUrl;
  const isOpen = Boolean(activeDoc);

  const syncUrl = useCallback(
    (docId: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (docId) params.set("doc", docId);
      else params.delete("doc");
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const openDocument = useCallback(
    (doc: DocumentListItem) => {
      setSelectedDoc(doc);
      syncUrl(doc.id);
    },
    [syncUrl],
  );

  const closeDrawer = useCallback(() => {
    setSelectedDoc(null);
    syncUrl(null);
  }, [syncUrl]);

  const {
    drawerWidth,
    isResizing,
    isMobileDrawer,
    resizeHandleProps,
  } = useResizableDrawerWidth();

  const value = useMemo(
    () => ({
      selectedId: activeDoc?.id ?? null,
      selectedDoc: activeDoc,
      isOpen,
      openDocument,
      closeDrawer,
      setSelectedDoc,
      drawerWidth,
      isResizing,
      isMobileDrawer,
      resizeHandleProps,
    }),
    [
      activeDoc,
      isOpen,
      openDocument,
      closeDrawer,
      drawerWidth,
      isResizing,
      isMobileDrawer,
      resizeHandleProps,
    ],
  );

  return (
    <DocumentDrawerContext.Provider value={value}>{children}</DocumentDrawerContext.Provider>
  );
}

export function useDocumentDrawer(): DocumentDrawerContextValue {
  const ctx = useContext(DocumentDrawerContext);
  if (!ctx) throw new Error("useDocumentDrawer must be used within DocumentDrawerProvider");
  return ctx;
}
