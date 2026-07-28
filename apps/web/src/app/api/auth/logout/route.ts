import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerApiUrl } from "@/lib/serverApiUrl";

const TOKEN_COOKIE = "wiki_token";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_COOKIE)?.value;

  if (token) {
    await fetch(`${getServerApiUrl()}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => undefined);
  }

  const response = NextResponse.json({ data: { loggedOut: true } });
  response.cookies.set(TOKEN_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}
