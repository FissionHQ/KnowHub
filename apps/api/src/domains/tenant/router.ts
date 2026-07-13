import { Router } from "express";
import type { Db } from "@wiki/db";
import { resolveOrgByHost } from "../../lib/resolveOrgByHost.js";

export function createTenantRouter(db: Db, baseDomain: string): Router {
  const router = Router();

  // GET /tenant/resolve — public endpoint for domain → org mapping
  router.get("/resolve", async (req, res) => {
    const host = (req.headers["x-forwarded-host"] as string | undefined) ?? req.headers.host ?? "";
    const org = await resolveOrgByHost(db, host, baseDomain);

    if (!org) {
      // Dev fallback
      if (baseDomain === "localhost") {
        res.json({
          data: {
            resolved: false,
            devMode: true,
            defaultSlug: "acme",
          },
        });
        return;
      }
      res.json({ data: { resolved: false } });
      return;
    }

    res.json({
      data: {
        resolved: true,
        orgId: org.id,
        slug: org.subdomain,
        name: org.name,
        branding: org.branding,
        status: org.status,
      },
    });
  });

  return router;
}
