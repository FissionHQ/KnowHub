import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";

export const runtime = "nodejs";

// Disable Next.js body parsing so we can stream the raw multipart body
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get("wiki_token")?.value;

  if (!token) {
    return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  }

  // Forward the raw request body with its original content-type (multipart boundary)
  const contentType = request.headers.get("content-type") ?? "";

  const res = await fetch(`${API_URL}/api/documents/${documentId}/attachments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": contentType,
    },
    body: request.body,
    // @ts-expect-error - duplex required for streaming request body in Node.js
    duplex: "half",
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
