import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import mammoth from "mammoth";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const { attachmentId } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get("wiki_token")?.value;

  if (!token) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Get presigned URL from the Express API
  const metaRes = await fetch(`${API_URL}/api/attachments/${attachmentId}/view`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!metaRes.ok) {
    return new NextResponse("Attachment not available", { status: metaRes.status });
  }

  const { data } = (await metaRes.json()) as { data: { url: string } };

  // Fetch the actual file bytes from S3
  const fileRes = await fetch(data.url);
  if (!fileRes.ok) {
    return new NextResponse("Failed to fetch file", { status: 502 });
  }

  const buffer = Buffer.from(await fileRes.arrayBuffer());

  // Convert DOCX to HTML using mammoth
  try {
    const result = await mammoth.convertToHtml({ buffer });
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; }
          img { max-width: 100%; height: auto; }
          table { border-collapse: collapse; width: 100%; margin: 1em 0; }
          td, th { border: 1px solid #ddd; padding: 8px; }
          th { background: #f5f5f5; }
        </style>
      </head>
      <body>${result.value}</body>
      </html>
    `;
    return new NextResponse(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch {
    return new NextResponse("Failed to convert document", { status: 500 });
  }
}
