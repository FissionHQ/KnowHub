"use client";

import { useEffect, useCallback, useState } from "react";
import useSWR from "swr";
import { documentsApi, spacesApi } from "@/lib/api";
import { Button, Separator } from "@heroui/react";
import { X, CheckCircle2, AlertCircle } from "lucide-react";
import clsx from "clsx";
import type { DocumentListItem } from "@wiki/types";
import { useDocumentDrawer } from "./DocumentDrawerContext";
import { useDocumentPreview } from "./useDocumentPreview";
import { DocumentPreview } from "./DocumentPreview";
import { DocumentMetadata } from "./DocumentMetadata";
import { DocumentActions } from "./DocumentActions";
import { DocumentFileIcon } from "./DocumentFileIcon";

const PANEL_TRANSITION_MS = 300;

type SaveStatus = "saved" | "saving" | "unsaved";

interface Props {
  spaceId: string;
  onMutate: () => void;
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "saved") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 shrink-0">
        <CheckCircle2 size={10} /> Saved
      </span>
    );
  }
  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-zinc-400 shrink-0 animate-pulse">
        Saving…
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 shrink-0">
      <AlertCircle size={10} /> Unsaved
    </span>
  );
}

function DrawerPanel({
  doc,
  spaceId,
  onMutate,
  onClose,
  onRenamed,
  showResizeHandle,
}: {
  doc: DocumentListItem;
  spaceId: string;
  onMutate: () => void;
  onClose: () => void;
  onRenamed: (title: string) => void;
  showResizeHandle: boolean;
}) {
  const { resizeHandleProps } = useDocumentDrawer();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");

  const { data: fullDoc, mutate: mutateDoc } = useSWR(`doc:${doc.id}`, () => documentsApi.get(doc.id));
  const { data: space } = useSWR(`space:${spaceId}`, () => spacesApi.get(spaceId));
  const { pdfUrl, status } = useDocumentPreview(doc);

  const isEditablePage = doc.type === "page" && (doc.canEdit ?? false);

  useEffect(() => {
    setSaveStatus("saved");
  }, [doc.id]);

  return (
    <>
      {showResizeHandle && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize preview panel"
          tabIndex={0}
          {...resizeHandleProps}
          className={clsx(
            "absolute left-0 top-0 bottom-0 z-20 w-3 -translate-x-1/2",
            "cursor-col-resize touch-none select-none",
            "group flex items-stretch justify-center",
          )}
        >
          <div
            className={clsx(
              "w-px h-full transition-colors duration-150",
              "bg-transparent group-hover:bg-violet-400 dark:group-hover:bg-violet-500",
              "group-active:bg-violet-500 dark:group-active:bg-violet-400",
            )}
          />
        </div>
      )}

      <div className="sticky top-0 z-10 flex items-start justify-between gap-2 px-4 pt-4 pb-2 bg-white dark:bg-zinc-950 border-b border-transparent">
        <div className="flex flex-col gap-1 min-w-0 flex-1 pr-8">
          <div className="flex items-center gap-2.5 min-w-0">
            <DocumentFileIcon doc={doc} size={20} />
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 truncate leading-tight">
              {doc.title}
            </h2>
            {isEditablePage && <SaveIndicator status={saveStatus} />}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Close drawer"
          className="absolute top-3 right-3 min-w-8 px-2 shrink-0"
          onClick={onClose}
        >
          <X size={16} />
        </Button>
      </div>

      <div className="px-4 py-4 space-y-4">
        <section aria-label="Document details">
          <DocumentMetadata
            doc={doc}
            fullDoc={fullDoc ?? null}
            {...(space?.name ? { spaceName: space.name } : {})}
          />
        </section>

        <section aria-label="Actions">
          <DocumentActions
            doc={doc}
            spaceId={spaceId}
            pdfUrl={pdfUrl}
            onRenamed={onRenamed}
            onDeleted={onMutate}
          />
        </section>

        <Separator />

        <section aria-label="Document content">
          <DocumentPreview
            doc={doc}
            pdfUrl={pdfUrl}
            processingStatus={status}
            fullDocument={fullDoc ?? null}
            onSaveStatusChange={setSaveStatus}
            onContentSaved={() => {
              void mutateDoc();
              onMutate();
            }}
          />
        </section>
      </div>
    </>
  );
}

export function DocumentPreviewDrawer({ spaceId, onMutate }: Props) {
  const {
    selectedDoc,
    isOpen,
    closeDrawer,
    setSelectedDoc,
    drawerWidth,
    isResizing,
    isMobileDrawer,
  } = useDocumentDrawer();

  const [displayDoc, setDisplayDoc] = useState<DocumentListItem | null>(null);
  const [panelVisible, setPanelVisible] = useState(false);

  useEffect(() => {
    if (selectedDoc) {
      setDisplayDoc(selectedDoc);
      const frame = requestAnimationFrame(() => setPanelVisible(true));
      return () => cancelAnimationFrame(frame);
    }

    setPanelVisible(false);
    const timer = window.setTimeout(() => setDisplayDoc(null), PANEL_TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [selectedDoc]);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) closeDrawer();
    },
    [isOpen, closeDrawer],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [handleEscape]);

  if (!displayDoc) return null;

  const handleRenamed = (newTitle: string) => {
    onMutate();
    setDisplayDoc({ ...displayDoc, title: newTitle });
    if (selectedDoc) setSelectedDoc({ ...selectedDoc, title: newTitle });
  };

  const animatePanel = !isResizing;

  if (isMobileDrawer) {
    return (
      <>
        {panelVisible && (
          <button
            type="button"
            aria-label="Close preview"
            className="fixed inset-0 z-30 bg-black/20 dark:bg-black/40 transition-opacity duration-300"
            onClick={closeDrawer}
          />
        )}

        <aside
          role="dialog"
          aria-modal="true"
          aria-label={`Preview: ${displayDoc.title}`}
          className={clsx(
            "fixed z-40 top-0 right-0 h-full w-full bg-white dark:bg-zinc-950 flex flex-col",
            animatePanel && "transition-transform duration-300 ease-out",
            panelVisible ? "translate-x-0" : "translate-x-full",
          )}
        >
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
            <DrawerPanel
              doc={displayDoc}
              spaceId={spaceId}
              onMutate={onMutate}
              onClose={closeDrawer}
              onRenamed={handleRenamed}
              showResizeHandle={false}
            />
          </div>
        </aside>
      </>
    );
  }

  return (
    <div
      className={clsx(
        "shrink-0 h-full overflow-hidden relative",
        animatePanel && "transition-[width] duration-300 ease-out",
      )}
      style={{ width: panelVisible ? drawerWidth : 0 }}
      aria-hidden={!panelVisible}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Preview: ${displayDoc.title}`}
        className="h-full bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col relative overflow-hidden"
        style={{ width: drawerWidth }}
      >
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          <DrawerPanel
          doc={displayDoc}
          spaceId={spaceId}
          onMutate={onMutate}
          onClose={closeDrawer}
          onRenamed={handleRenamed}
          showResizeHandle
          />
        </div>
      </aside>
    </div>
  );
}
