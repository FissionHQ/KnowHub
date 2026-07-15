import { NextResponse } from "next/server";
import { cookies } from "next/headers";

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

  // Fetch the actual file bytes from S3 presigned URL (server-side, no CORS)
  const fileRes = await fetch(data.url);
  if (!fileRes.ok) {
    return new NextResponse("Failed to fetch file from storage", { status: 502 });
  }

  const contentType = fileRes.headers.get("content-type") || "application/octet-stream";

  return new NextResponse(fileRes.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=240",
    },
  });
}
