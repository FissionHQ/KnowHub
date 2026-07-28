import { NextResponse } from "next/server";
import { getServerApiUrl } from "@/lib/serverApiUrl";

const TOKEN_COOKIE = "wiki_token";
const TOKEN_MAX_AGE = 30 * 24 * 60 * 60;

export async function POST(request: Request) {
  const body = await request.json();

  let upstream: Response;
  try {
    upstream = await fetch(`${getServerApiUrl()}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          message:
            "Cannot reach the API server. Ensure `pnpm dev` is running and the API started (check JWT_SECRET is 32+ chars and DATABASE_URL uses port 5434).",
        },
      },
      { status: 502 },
    );
  }

  const payload = await upstream.json().catch(() => ({
    error: { message: "Unexpected response from API server" },
  }));
  const response = NextResponse.json(payload, { status: upstream.status });

  if (upstream.ok && payload?.data?.token) {
    response.cookies.set(TOKEN_COOKIE, payload.data.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: TOKEN_MAX_AGE,
      path: "/",
    });
  }

  return response;
}
