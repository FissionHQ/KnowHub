import { NextResponse } from "next/server";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";
const TOKEN_COOKIE = "wiki_token";
const TOKEN_MAX_AGE = 30 * 24 * 60 * 60;

export async function POST(request: Request) {
  const body = await request.json();
  const upstream = await fetch(`${API_URL}/api/auth/accept-invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload = await upstream.json();
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
