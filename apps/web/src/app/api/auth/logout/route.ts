import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { TOKEN_COOKIE, authCookieOptions } from "@/lib/authCookie";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_COOKIE)?.value;

  if (token) {
    await fetch(`${API_URL}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => undefined);
  }

  const response = NextResponse.json({ data: { loggedOut: true } });
  response.cookies.set(TOKEN_COOKIE, "", {
    ...authCookieOptions(),
    maxAge: 0,
  });
  return response;
}
