import { eq } from "drizzle-orm";
import type { Db } from "@wiki/db";
import { organizations, organizationDomains } from "@wiki/db";

export interface ResolvedOrg {
  id: string;
  subdomain: string;
  name: string;
  branding: Record<string, unknown>;
  status: "active" | "suspended";
}

/**
 * Resolve an organization from the HTTP Host header.
 * Supports subdomain ({slug}.BASE_DOMAIN) and custom domains (organization_domains table).
 */
export async function resolveOrgByHost(
  db: Db,
  host: string,
  baseDomain: string,
): Promise<ResolvedOrg | null> {
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  if (!hostname) return null;

  // Custom domain lookup (e.g. wiki.customer.com)
  const customRows = await db
    .select({
      id: organizations.id,
      subdomain: organizations.subdomain,
      name: organizations.name,
      branding: organizations.branding,
      status: organizations.status,
    })
    .from(organizationDomains)
    .innerJoin(organizations, eq(organizationDomains.orgId, organizations.id))
    .where(eq(organizationDomains.domain, hostname));

  if (customRows.length) {
    const row = customRows[0]!;
    return { ...row, branding: row.branding as Record<string, unknown> };
  }

  // Subdomain: acme.wiki.example.com → slug "acme"
  if (baseDomain !== "localhost" && hostname.endsWith(`.${baseDomain}`)) {
    const withoutBase = hostname.slice(0, -(baseDomain.length + 1));
    const slug = withoutBase.split(".")[0];
    if (slug) {
      const rows = await db
        .select()
        .from(organizations)
        .where(eq(organizations.subdomain, slug));
      if (rows.length) {
        const row = rows[0]!;
        return { ...row, branding: row.branding as Record<string, unknown> };
      }
    }
  }

  // Dev: localhost — no host-based resolution
  return null;
}

/**
 * Extract tenant slug from host for subdomain routing.
 */
export function extractSubdomainFromHost(host: string, baseDomain: string): string | null {
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  if (!hostname || baseDomain === "localhost") return null;
  if (hostname.endsWith(`.${baseDomain}`)) {
    const withoutBase = hostname.slice(0, -(baseDomain.length + 1));
    return withoutBase.split(".")[0] ?? null;
  }
  return null;
}
