"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { documentsApi } from "@/lib/api";
import type { DocumentListItem } from "@wiki/types";
import { Button, Dropdown } from "@heroui/react";
import {
  Copy,
  Download,
  ExternalLink,
  History,
  Link2,
  MoreHorizontal,
  Pencil,
  Share2,
  Trash2,
} from "lucide-react";
import { DeleteDocumentModal } from "./DeleteDocumentModal";
import { useDocumentDrawer } from "./DocumentDrawerContext";
import { clearPreviewCache } from "./useDocumentPreview";

interface Props {
  doc: DocumentListItem;
  spaceId: string;
  pdfUrl: string | null;
  onRenamed?: (title: string) => void;
  onDeleted?: () => void;
}

export function DocumentActions({
  doc,
  spaceId,
  pdfUrl,
  onRenamed,
  onDeleted,
}: Props) {
  const router = useRouter();
  const { closeDrawer } = useDocumentDrawer();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newTitle, setNewTitle] = useState(doc.title);

  const docUrl = `/spaces/${spaceId}/docs/${doc.id}`;
  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/spaces/${spaceId}?doc=${doc.id}`
      : docUrl;

  async function handleCopyLink() {
    await navigator.clipboard.writeText(shareUrl);
  }

  async function handleDownload() {
    if (!pdfUrl) return;
    const a = document.createElement("a");
    a.href = pdfUrl;
    a.download = doc.title.endsWith(".pdf") ? doc.title : `${doc.title}.pdf`;
    a.target = "_blank";
    a.rel = "noopener";
    a.click();
  }

  async function handleRename() {
    if (!newTitle.trim() || newTitle === doc.title) {
      setRenaming(false);
      return;
    }
    await documentsApi.update(doc.id, { title: newTitle.trim() });
    setRenaming(false);
    onRenamed?.(newTitle.trim());
  }

  return (
    <div className="space-y-3">
      {renaming ? (
        <div className="flex gap-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="flex-1 h-9 px-3 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
              if (e.key === "Escape") setRenaming(false);
            }}
          />
          <Button size="sm" variant="primary" onClick={handleRename}>
            Save
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setRenaming(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Link href={docUrl as never}>
            <Button size="sm" variant="primary" className="gap-1.5">
              <ExternalLink size={14} />
              Open
            </Button>
          </Link>
          {pdfUrl && (
            <Button size="sm" variant="secondary" className="gap-1.5" onClick={handleDownload}>
              <Download size={14} />
              Download
            </Button>
          )}
          <Button size="sm" variant="secondary" className="gap-1.5" onClick={handleCopyLink}>
            <Share2 size={14} />
            Share
          </Button>
          <Button size="sm" variant="secondary" className="gap-1.5" onClick={handleCopyLink}>
            <Link2 size={14} />
            Copy Link
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setRenaming(true)}>
          <Pencil size={14} />
          Rename
        </Button>
        {doc.type === "page" && (
          <Link href={docUrl as never}>
            <Button size="sm" variant="secondary" className="gap-1.5">
              <History size={14} />
              View Versions
            </Button>
          </Link>
        )}
        {doc.canDelete && (
          <Button
            size="sm"
            variant="secondary"
            className="gap-1.5 text-red-600 hover:text-red-700"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 size={14} />
            Delete
          </Button>
        )}
        <Dropdown>
          <Dropdown.Trigger>
            <Button size="sm" variant="ghost" aria-label="More actions">
              <MoreHorizontal size={16} />
            </Button>
          </Dropdown.Trigger>
          <Dropdown.Popover placement="bottom end">
            <Dropdown.Menu
              onAction={(key) => {
                if (key === "copy") handleCopyLink();
                if (key === "rename") setRenaming(true);
                if (key === "delete" && doc.canDelete) setDeleteOpen(true);
              }}
            >
              <Dropdown.Item id="copy" textValue="Copy link">
                <span className="flex items-center gap-2">
                  <Copy size={14} /> Copy link
                </span>
              </Dropdown.Item>
              <Dropdown.Item id="rename" textValue="Rename">
                <span className="flex items-center gap-2">
                  <Pencil size={14} /> Rename
                </span>
              </Dropdown.Item>
              {doc.canDelete && (
                <Dropdown.Item id="delete" textValue="Delete">
                  <span className="flex items-center gap-2 text-red-600">
                    <Trash2 size={14} /> Delete
                  </span>
                </Dropdown.Item>
              )}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </div>

      <DeleteDocumentModal
        open={deleteOpen}
        title={doc.title}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          await documentsApi.delete(doc.id);
          clearPreviewCache(doc.id);
          setDeleteOpen(false);
          closeDrawer();
          onDeleted?.();
          router.replace(`/spaces/${spaceId}`);
        }}
      />
    </div>
  );
}
