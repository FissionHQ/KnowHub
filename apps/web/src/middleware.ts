import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PAGE_PREFIXES = ["/login", "/invite", "/platform"];
const TOKEN_COOKIE = "wiki_token";
const BASE_DOMAIN = process.env["BASE_DOMAIN"] ?? process.env["NEXT_PUBLIC_BASE_DOMAIN"] ?? "localhost";

function extractSubdomain(host: string): string | null {
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  if (!hostname || BASE_DOMAIN === "localhost") return null;
  if (hostname.endsWith(`.${BASE_DOMAIN}`)) {
    return hostname.slice(0, -(BASE_DOMAIN.length + 1)).split(".")[0] ?? null;
  }
  return null;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(TOKEN_COOKIE)?.value;
  const host = request.headers.get("host") ?? "";
  const subdomain = extractSubdomain(host);

  const requestHeaders = new Headers(request.headers);
  if (subdomain) {
    requestHeaders.set("x-tenant-slug", subdomain);
  }
  requestHeaders.set("x-forwarded-host", host);

  if (pathname.startsWith("/api/")) {
    if (pathname.startsWith("/api/auth/") && !pathname.startsWith("/api/auth/invite/")) {
      return NextResponse.next({ request: { headers: requestHeaders } });
    }

    if (token) {
      requestHeaders.set("Authorization", `Bearer ${token}`);
    }

    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (PUBLIC_PAGE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|pdf.worker.min.mjs).*)"],
};
