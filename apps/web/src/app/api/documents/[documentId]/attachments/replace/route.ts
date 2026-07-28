import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerApiUrl } from "@/lib/serverApiUrl";

export const runtime = "nodejs";
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

  const contentType = request.headers.get("content-type") ?? "";

  const res = await fetch(`${getServerApiUrl()}/api/documents/${documentId}/attachments/replace`, {
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
