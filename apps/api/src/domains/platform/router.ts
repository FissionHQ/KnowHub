import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { Db } from "@wiki/db";
import { organizations, organizationDomains } from "@wiki/db";
import { ValidationError, NotFoundError } from "../../lib/errors.js";
import { provisionOrg } from "../../lib/provisionOrg.js";
import { validatePasswordPolicy } from "../../lib/password.js";

const provisionSchema = z.object({
  subdomain: z
    .string()
    .min(2)
    .max(63)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, "Invalid subdomain"),
  name: z.string().min(1).max(200),
  adminEmail: z.string().email(),
  adminName: z.string().min(1).max(200),
  adminPassword: z.string().min(8),
  branding: z
    .object({
      logoUrl: z.string().url().optional(),
      primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    })
    .optional(),
});

const addDomainSchema = z.object({
  domain: z.string().min(3).max(253),
  isPrimary: z.boolean().optional(),
});

const updateOrgSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(["active", "suspended"]).optional(),
});

export function createPlatformRouter(db: Db, baseDomain: string): Router {
  const router = Router();

  // GET /platform/organizations
  router.get("/organizations", async (_req, res) => {
    const rows = await db
      .select({
        id: organizations.id,
        subdomain: organizations.subdomain,
        name: organizations.name,
        status: organizations.status,
        branding: organizations.branding,
        createdAt: organizations.createdAt,
      })
      .from(organizations);

    const domains = await db.select().from(organizationDomains);
    const domainsByOrg = new Map<string, typeof domains>();
    for (const d of domains) {
      const list = domainsByOrg.get(d.orgId) ?? [];
      list.push(d);
      domainsByOrg.set(d.orgId, list);
    }

    res.json({
      data: rows.map((org) => ({
        ...org,
        loginUrl: `https://${org.subdomain}.${baseDomain}`,
        domains: domainsByOrg.get(org.id) ?? [],
      })),
    });
  });

  // POST /platform/organizations — provision new tenant
  router.post("/organizations", async (req, res) => {
    const body = provisionSchema.safeParse(req.body);
    if (!body.success) throw new ValidationError(body.error.flatten());

    const policyErr = validatePasswordPolicy(body.data.adminPassword);
    if (policyErr) throw new ValidationError(policyErr);

    const result = await provisionOrg(db, {
      subdomain: body.data.subdomain,
      name: body.data.name,
      adminEmail: body.data.adminEmail,
      adminName: body.data.adminName,
      adminPassword: body.data.adminPassword,
      ...(body.data.branding ? { branding: body.data.branding } : {}),
    });

    res.status(201).json({
      data: {
        ...result,
        loginUrl: `https://${result.subdomain}.${baseDomain}`,
      },
    });
  });

  // PATCH /platform/organizations/:orgId
  router.patch("/organizations/:orgId", async (req, res) => {
    const body = updateOrgSchema.safeParse(req.body);
    if (!body.success) throw new ValidationError(body.error.flatten());

    const { orgId } = req.params;
    const rows = await db.select().from(organizations).where(eq(organizations.id, orgId ?? ""));
    if (!rows.length) throw new NotFoundError("Organization");

    const updates: Partial<{ name: string; status: "active" | "suspended" }> = {};
    if (body.data.name !== undefined) updates.name = body.data.name;
    if (body.data.status !== undefined) updates.status = body.data.status;

    const updated = await db
      .update(organizations)
      .set(updates)
      .where(eq(organizations.id, orgId ?? ""))
      .returning();

    res.json({ data: updated[0] });
  });

  // POST /platform/organizations/:orgId/domains
  router.post("/organizations/:orgId/domains", async (req, res) => {
    const body = addDomainSchema.safeParse(req.body);
    if (!body.success) throw new ValidationError(body.error.flatten());

    const { orgId } = req.params;
    const orgRows = await db.select().from(organizations).where(eq(organizations.id, orgId ?? ""));
    if (!orgRows.length) throw new NotFoundError("Organization");

    const domain = body.data.domain.toLowerCase();

    if (body.data.isPrimary) {
      await db
        .update(organizationDomains)
        .set({ isPrimary: false })
        .where(eq(organizationDomains.orgId, orgId ?? ""));
    }

    const inserted = await db
      .insert(organizationDomains)
      .values({
        id: uuidv4(),
        orgId: orgId ?? "",
        domain,
        isPrimary: body.data.isPrimary ?? false,
      })
      .returning();

    res.status(201).json({ data: inserted[0] });
  });

  // DELETE /platform/organizations/:orgId/domains/:domainId
  router.delete("/organizations/:orgId/domains/:domainId", async (req, res) => {
    const { orgId, domainId } = req.params;

    const rows = await db
      .select()
      .from(organizationDomains)
      .where(eq(organizationDomains.id, domainId ?? ""));

    if (!rows.length || rows[0]!.orgId !== orgId) {
      throw new NotFoundError("Domain");
    }

    await db.delete(organizationDomains).where(eq(organizationDomains.id, domainId ?? ""));
    res.json({ data: { deleted: true } });
  });

  return router;
}
