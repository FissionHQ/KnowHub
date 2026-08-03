import { loadPresentation, type SlideElement, type TextBody } from "pptx-viewer";

function textFromBody(body: TextBody | undefined): string[] {
  if (!body?.paragraphs?.length) return [];
  return body.paragraphs
    .map((para) =>
      (para.runs ?? [])
        .map((run) => run.text ?? "")
        .join("")
        .trim(),
    )
    .filter(Boolean);
}

function collectTextFromElement(el: SlideElement): string[] {
  const parts: string[] = [];

  if (el.type === "text") {
    parts.push(...textFromBody(el.text));
  }

  if (el.type === "shape") {
    parts.push(...textFromBody(el.text));
  }

  if (el.type === "table") {
    for (const row of el.rows ?? []) {
      for (const cell of row.cells ?? []) {
        parts.push(...textFromBody(cell.text));
      }
    }
  }

  if (el.type === "group") {
    for (const child of el.children ?? []) {
      parts.push(...collectTextFromElement(child));
    }
  }

  return parts;
}

/** Convert a PPTX file to simple editable HTML (one section per slide). */
export async function extractPptxAsHtml(file: File): Promise<string> {
  const presentation = await loadPresentation(file);
  try {
    const sections: string[] = [];

    presentation.slides.forEach((slide, index) => {
      const texts = (slide.elements ?? []).flatMap(collectTextFromElement);
      const body =
        texts.length > 0
          ? texts.map((t) => `<p>${escapeHtml(t)}</p>`).join("")
          : `<p><em>(Slide ${index + 1} — no extractable text)</em></p>`;
      sections.push(
        `<section data-slide="${index + 1}"><h2>Slide ${index + 1}</h2>${body}</section>`,
      );
    });

    if (!sections.length) {
      return "<p><em>No slides found in this presentation.</em></p>";
    }

    return sections.join("");
  } finally {
    presentation.cleanup();
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
