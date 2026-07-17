import type { Document } from "@wiki/types";
import { documentsApi } from "@/lib/api";
import { parseFileToHtml } from "@/lib/importers";

function isPdfFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".pdf");
}

/** Import a file into a space as an editable page (PDFs are converted to HTML but tagged type pdf). */
export async function importDocumentFile(spaceId: string, file: File): Promise<Document> {
  const title = file.name.replace(/\.[^.]+$/, "");
  const html = await parseFileToHtml(file);
  const type = isPdfFile(file) ? "pdf" : "page";
  return documentsApi.create({ spaceId, type, title, content: html });
}
