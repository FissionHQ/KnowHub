import type { DocumentListItem } from "@wiki/types";

export type DocumentViewFilter = "recent" | "categories" | "all" | "mine";
export type DocumentSortKey = "updatedAt" | "createdAt" | "title";

export interface DocumentTableState {
  view: DocumentViewFilter;
  search: string;
  sortKey: DocumentSortKey;
  sortAsc: boolean;
}

export type ProcessingStatus = "idle" | "processing" | "ready" | "error";

export interface PreviewCacheEntry {
  pdfUrl: string | null;
  status: ProcessingStatus;
  attachmentId?: string;
}

export function filterAndSortDocuments(
  docs: DocumentListItem[],
  state: DocumentTableState,
  currentUserId?: string,
): DocumentListItem[] {
  let result = [...docs];

  if (state.view === "mine" && currentUserId) {
    result = result.filter((d) => d.ownerId === currentUserId);
  }

  if (state.search.trim()) {
    const q = state.search.toLowerCase();
    result = result.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.tags.some((t) => t.toLowerCase().includes(q)) ||
        d.ownerName.toLowerCase().includes(q),
    );
  }

  result.sort((a, b) => {
    let cmp = 0;
    if (state.sortKey === "title") {
      cmp = a.title.localeCompare(b.title);
    } else if (state.sortKey === "createdAt") {
      cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    } else {
      cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
    }
    return state.sortAsc ? cmp : -cmp;
  });

  return result;
}

export function getProcessingStatus(doc: DocumentListItem): ProcessingStatus | null {
  if (doc.type !== "pdf") return null;
  const s = doc.attachmentScanStatus;
  if (!s || s === "pending" || s === "scanning") return "processing";
  if (s === "error") return "error";
  if (s === "clean") return "ready";
  return "processing";
}
