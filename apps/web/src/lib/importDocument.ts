import type { Document } from "@wiki/types";
import { documentsApi, attachmentsApi } from "@/lib/api";
import { parseFileToHtml } from "@/lib/importers";

function isPdfFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".pdf");
}

function isPowerPointFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".pptx") || name.endsWith(".ppt");
}

/** Import a file into a space as an editable page (PDF/PPT keep their type with converted HTML). */
export async function importDocumentFile(spaceId: string, file: File): Promise<Document> {
  const title = file.name.replace(/\.[^.]+$/, "");
  const html = await parseFileToHtml(file);
  const type = isPdfFile(file) ? "pdf" : isPowerPointFile(file) ? "pptx" : "page";
  return documentsApi.create({ spaceId, type, title, content: html });
}

/** Create a pdf doc with no content body and attach the original file — renders via PdfViewer. */
export async function importPdfAsViewer(spaceId: string, file: File): Promise<Document> {
  const title = file.name.replace(/\.[^.]+$/, "");
  const doc = await documentsApi.create({ spaceId, type: "pdf", title });
  await attachmentsApi.upload(doc.id, file);
  return doc;
}

/** Create a pptx doc with no content body and attach the original file — renders via PptxViewer. */
export async function importPptxAsViewer(spaceId: string, file: File): Promise<Document> {
  const title = file.name.replace(/\.[^.]+$/, "");
  const doc = await documentsApi.create({ spaceId, type: "pptx", title });
  await attachmentsApi.upload(doc.id, file);
  return doc;
}
