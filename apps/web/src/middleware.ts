import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PAGE_PREFIXES = ["/login", "/invite"];
const TOKEN_COOKIE = "wiki_token";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(TOKEN_COOKIE)?.value;

  if (pathname.startsWith("/api/")) {
    if (pathname.startsWith("/api/auth/") && !pathname.startsWith("/api/auth/invite/")) {
      return NextResponse.next();
    }

    if (token) {
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set("Authorization", `Bearer ${token}`);
      return NextResponse.next({ request: { headers: requestHeaders } });
    }

    return NextResponse.next();
  }

  if (PUBLIC_PAGE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
