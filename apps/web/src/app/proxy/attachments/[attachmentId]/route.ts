import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerApiUrl } from "@/lib/serverApiUrl";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const { attachmentId } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get("wiki_token")?.value;

  if (!token) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Get presigned URL from the Express API
  const metaRes = await fetch(`${getServerApiUrl()}/api/attachments/${attachmentId}/view`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!metaRes.ok) {
    return new NextResponse("Attachment not available", { status: metaRes.status });
  }

  const { data } = (await metaRes.json()) as { data: { url: string } };

  const range = request.headers.get("range");

  // Fetch from S3 server-side (no browser CORS); forward Range for PDF streaming
  const fileRes = range
    ? await fetch(data.url, { headers: { Range: range } })
    : await fetch(data.url);
  if (!fileRes.ok && fileRes.status !== 206) {
    return new NextResponse("Failed to fetch file from storage", { status: 502 });
  }

  const contentType = fileRes.headers.get("content-type") || "application/octet-stream";
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Cache-Control": "private, max-age=240",
    "Accept-Ranges": "bytes",
  };
  const contentLength = fileRes.headers.get("content-length");
  const contentRange = fileRes.headers.get("content-range");
  if (contentLength) headers["Content-Length"] = contentLength;
  if (contentRange) headers["Content-Range"] = contentRange;

  return new NextResponse(fileRes.body, {
    status: fileRes.status,
    headers,
  });
}
