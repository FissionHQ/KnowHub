import { NextResponse } from "next/server";
import { TOKEN_COOKIE, authCookieOptions } from "@/lib/authCookie";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";

export async function POST(request: Request) {
  const body = await request.json();

  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/api/auth/login`, {
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
    response.cookies.set(TOKEN_COOKIE, payload.data.token, authCookieOptions());
  }

  return response;
}
