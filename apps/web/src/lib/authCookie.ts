/** httpOnly auth session cookie name (must match API / middleware). */
export const TOKEN_COOKIE = "wiki_token";

const TOKEN_MAX_AGE_SEC = 30 * 24 * 60 * 60;

/**
 * Secure cookies are only sent over HTTPS. On plain HTTP deploys (e.g.
 * http://IP:3000) Secure must be false or the browser never stores wiki_token
 * and every /api call looks unauthenticated.
 *
 * Prefer COOKIE_SECURE=true|false; fall back to NODE_ENV===production.
 */
export function authCookieSecure(): boolean {
  const raw = process.env["COOKIE_SECURE"]?.trim().toLowerCase();
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return process.env.NODE_ENV === "production";
}

export function authCookieOptions(maxAgeSec = TOKEN_MAX_AGE_SEC) {
  return {
    httpOnly: true,
    secure: authCookieSecure(),
    sameSite: "lax" as const,
    maxAge: maxAgeSec,
    path: "/",
  };
}
