import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const TOKEN_COOKIE = "wiki_token";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_COOKIE)?.value;

  if (!token) {
    return NextResponse.json({ error: { message: "Not authenticated" } }, { status: 401 });
  }

  return NextResponse.json({ data: { token } });
}
