import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { getServerApiUrl } from "@/lib/serverApiUrl";

const TEXT_EXTENSIONS = new Set([
  "txt", "csv", "md", "json", "xml", "log", "ini", "cfg", "conf", "env", "yml", "yaml", "toml",
]);
const CODE_EXTENSIONS = new Set([
  "js", "mjs", "cjs", "jsx", "ts", "tsx", "py", "rb", "go", "rs", "java", "kt", "scala",
  "c", "cpp", "cc", "h", "hpp", "cs", "php", "sh", "bash", "zsh", "sql", "lua", "swift", "r",
  "html", "css", "scss", "less",
]);

function getExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function wrapHtml(body: string, extra = ""): NextResponse {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px;line-height:1.6;color:#333;max-width:900px;margin:0 auto}
img{max-width:100%;height:auto}
table{border-collapse:collapse;width:100%;margin:1em 0}
td,th{border:1px solid #ddd;padding:6px 10px;text-align:left}
th{background:#f5f5f5;font-weight:600}
pre{background:#f8f8f8;border:1px solid #e0e0e0;border-radius:6px;padding:16px;overflow-x:auto;font-size:13px;line-height:1.5}
code{font-family:'Fira Code',Consolas,monospace}
${extra}
</style></head><body>${body}</body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

async function fetchFileBuffer(attachmentId: string, token: string): Promise<{ buffer: Buffer; filename: string } | NextResponse> {
  const metaRes = await fetch(`${getServerApiUrl()}/api/attachments/${attachmentId}/view`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaRes.ok) return new NextResponse("Attachment not available", { status: metaRes.status });

  const { data } = (await metaRes.json()) as { data: { url: string; filename?: string } };
  const fileRes = await fetch(data.url);
  if (!fileRes.ok) return new NextResponse("Failed to fetch file", { status: 502 });

  return { buffer: Buffer.from(await fileRes.arrayBuffer()), filename: data.filename ?? "" };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const { attachmentId } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get("wiki_token")?.value;
  if (!token) return new NextResponse("Unauthorized", { status: 401 });

  // Get filename from query param (passed by frontend)
  const url = new URL(request.url);
  const fileName = url.searchParams.get("name") ?? "";
  const ext = getExtension(fileName);

  const result = await fetchFileBuffer(attachmentId, token);
  if (result instanceof NextResponse) return result;
  const { buffer } = result;

  // DOCX
  if (ext === "docx" || ext === "doc") {
    try {
      const { value } = await mammoth.convertToHtml({ buffer });
      return wrapHtml(value);
    } catch {
      return new NextResponse("Failed to convert document", { status: 500 });
    }
  }

  // XLSX / XLS
  if (ext === "xlsx" || ext === "xls" || ext === "csv") {
    try {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      let html = "";
      for (const name of workbook.SheetNames) {
        const sheet = workbook.Sheets[name]!;
        html += `<h3>${escapeHtml(name)}</h3>`;
        html += XLSX.utils.sheet_to_html(sheet, { editable: false });
      }
      return wrapHtml(html);
    } catch {
      return new NextResponse("Failed to convert spreadsheet", { status: 500 });
    }
  }

  // Plain text / code files
  if (TEXT_EXTENSIONS.has(ext) || CODE_EXTENSIONS.has(ext)) {
    const text = buffer.toString("utf-8");
    const body = `<pre><code>${escapeHtml(text)}</code></pre>`;
    return wrapHtml(body);
  }

  return new NextResponse("Preview not supported for this file type", { status: 415 });
}
