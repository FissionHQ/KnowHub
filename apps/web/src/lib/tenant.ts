/**
 * Resolve tenant context from the browser hostname.
 * In production: acme.wiki.example.com → slug "acme"
 * In dev (localhost): returns null — API defaults to "acme"
 */
export function resolveTenantFromWindow(): {
  slug: string | null;
  isDev: boolean;
} {
  if (typeof window === "undefined") {
    return { slug: null, isDev: true };
  }

  const host = window.location.hostname;
  const baseDomain = process.env["NEXT_PUBLIC_BASE_DOMAIN"] ?? "localhost";

  if (baseDomain === "localhost" || host === "localhost" || host === "127.0.0.1") {
    return { slug: null, isDev: true };
  }

  if (host.endsWith(`.${baseDomain}`)) {
    const slug = host.slice(0, -(baseDomain.length + 1)).split(".")[0] ?? null;
    return { slug, isDev: false };
  }

  // Custom domain — resolved via API
  return { slug: null, isDev: false };
}

export function getOrgSlugForLogin(): string | undefined {
  const { slug, isDev } = resolveTenantFromWindow();
  if (slug) return slug;
  if (isDev) return "acme";
  return undefined;
}
