import { extractPdfAsHtml } from "./pdfImporter";
import mammoth from "mammoth";

export async function parseFileToHtml(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".pdf")) {
    return extractPdfAsHtml(file);
  }

  if (name.endsWith(".docx") || name.endsWith(".doc")) {
    const buffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
    return result.value;
  }

  // Plain text / markdown fallback
  const text = await file.text();
  return `<p>${text.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>`;
}
