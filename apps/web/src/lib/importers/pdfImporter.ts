interface PdfTextItem {
  str: string;
  transform: number[];
  fontName: string;
}

interface TextBlock {
  text: string;
  fontSize: number;
  fontName: string;
  y: number;
}

export async function extractPdfAsHtml(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  // Collect all text items with metadata across all pages
  const allBlocks: TextBlock[][] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageBlocks: TextBlock[] = [];

    for (const item of content.items) {
      if (!("str" in item) || !(item as PdfTextItem).str.trim()) continue;
      const ti = item as PdfTextItem;
      pageBlocks.push({
        text: ti.str,
        fontSize: Math.abs(ti.transform[0] ?? 12),
        fontName: ti.fontName,
        y: ti.transform[5] ?? 0,
      });
    }
    allBlocks.push(pageBlocks);
  }

  // Determine the most common (body) font size
  const fontSizeCounts = new Map<number, number>();
  for (const page of allBlocks) {
    for (const block of page) {
      const rounded = Math.round(block.fontSize);
      fontSizeCounts.set(rounded, (fontSizeCounts.get(rounded) ?? 0) + 1);
    }
  }
  let bodyFontSize = 12;
  let maxCount = 0;
  for (const [size, count] of fontSizeCounts) {
    if (count > maxCount) {
      maxCount = count;
      bodyFontSize = size;
    }
  }

  // Convert blocks to HTML with structure
  const htmlParts: string[] = [];

  for (const pageBlocks of allBlocks) {
    if (pageBlocks.length === 0) continue;

    let currentParagraph: string[] = [];
    let lastY = pageBlocks[0]?.y ?? 0;

    for (const block of pageBlocks) {
      const rounded = Math.round(block.fontSize);
      const yGap = Math.abs(block.y - lastY);
      const isNewLine = yGap > block.fontSize * 0.8;
      const isBold = block.fontName.toLowerCase().includes("bold");

      // Detect headings: significantly larger than body text
      if (rounded >= bodyFontSize + 4) {
        // Flush current paragraph
        if (currentParagraph.length > 0) {
          htmlParts.push(`<p>${currentParagraph.join(" ")}</p>`);
          currentParagraph = [];
        }
        // H1 for very large, H2 for medium-large
        const tag = rounded >= bodyFontSize + 8 ? "h1" : rounded >= bodyFontSize + 5 ? "h2" : "h3";
        htmlParts.push(`<${tag}>${escapeHtml(block.text)}</${tag}>`);
      } else if (rounded >= bodyFontSize + 2) {
        if (currentParagraph.length > 0) {
          htmlParts.push(`<p>${currentParagraph.join(" ")}</p>`);
          currentParagraph = [];
        }
        htmlParts.push(`<h3>${escapeHtml(block.text)}</h3>`);
      } else {
        // Body text — group into paragraphs based on Y gaps
        if (isNewLine && yGap > block.fontSize * 2 && currentParagraph.length > 0) {
          // Large gap = new paragraph
          htmlParts.push(`<p>${currentParagraph.join(" ")}</p>`);
          currentParagraph = [];
        }

        const escaped = escapeHtml(block.text);
        currentParagraph.push(isBold ? `<strong>${escaped}</strong>` : escaped);
      }

      lastY = block.y;
    }

    // Flush remaining paragraph
    if (currentParagraph.length > 0) {
      htmlParts.push(`<p>${currentParagraph.join(" ")}</p>`);
    }
  }

  return htmlParts.join("\n");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
