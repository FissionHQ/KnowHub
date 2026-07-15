import TurndownService from "turndown";
import { marked } from "marked";

const td = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

// Preserve tables
td.addRule("table", {
  filter: ["table"],
  replacement(_content, node) {
    const table = node as HTMLTableElement;
    const rows = Array.from(table.querySelectorAll("tr"));
    if (!rows.length) return "";

    const toRow = (cells: Element[]) =>
      "| " + cells.map((c) => (c.textContent ?? "").replace(/\|/g, "\\|").trim()).join(" | ") + " |";

    const header = rows[0] ? toRow(Array.from(rows[0].querySelectorAll("th,td"))) : "";
    const separator = rows[0]
      ? "| " + Array.from(rows[0].querySelectorAll("th,td")).map(() => "---").join(" | ") + " |"
      : "";
    const body = rows
      .slice(1)
      .map((r) => toRow(Array.from(r.querySelectorAll("td,th"))))
      .join("\n");

    return "\n\n" + [header, separator, body].filter(Boolean).join("\n") + "\n\n";
  },
});

/** Convert Tiptap HTML → Markdown string */
export function htmlToMarkdown(html: string): string {
  return td.turndown(html);
}

/** Convert Markdown string → HTML (for loading into Tiptap) */
export async function markdownToHtml(md: string): Promise<string> {
  return await marked(md, { async: true });
}

/** Trigger a file download in the browser */
export function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Read a text file chosen by the user */
export function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
