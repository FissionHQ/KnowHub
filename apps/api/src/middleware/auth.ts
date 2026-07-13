import type { NextFunction, Request, Response } from "express";
import * as jose from "jose";
import type { Db } from "@wiki/db";
import { UnauthorizedError } from "../lib/errors.js";
import { resolveOrgByHost, extractSubdomainFromHost } from "../lib/resolveOrgByHost.js";
import type { TenantContext, UserRole } from "@wiki/types";

declare global {
  namespace Express {
    interface Request {
      tenant: TenantContext;
    }
  }
}

export function createAuthMiddleware(opts: {
  jwtSecret: string;
  baseDomain: string;
  db: Db;
}) {
  const secret = new TextEncoder().encode(opts.jwtSecret);

  return async function authMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    const authHeader = req.headers.authorization;
    const cookieToken = req.cookies?.["wiki_token"] as string | undefined;
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
    const token = bearerToken ?? cookieToken;

    if (!token) {
      throw new UnauthorizedError("Missing Bearer token");
    }

    try {
      const { payload } = await jose.jwtVerify(token, secret);
      req.tenant = await extractTenantContext(payload, req, opts.baseDomain, opts.db);
      next();
    } catch {
      throw new UnauthorizedError("Invalid or expired token");
    }
  };
}

async function extractTenantContext(
  payload: jose.JWTPayload,
  req: Request,
  baseDomain: string,
  db: Db,
): Promise<TenantContext> {
  const orgId = payload["custom:org_id"] as string;
  const orgSlug = payload["custom:org_slug"] as string;
  const userId = payload["sub"] as string;
  const role = payload["custom:role"] as UserRole;

  if (!orgId || !userId) {
    throw new UnauthorizedError("Token missing required claims");
  }

  const host = req.headers.host ?? "";
  const resolved = await resolveOrgByHost(db, host, baseDomain);
  const subdomain = extractSubdomainFromHost(host, baseDomain);

  if (baseDomain !== "localhost") {
    if (resolved) {
      if (resolved.subdomain !== orgSlug || resolved.id !== orgId) {
        throw new UnauthorizedError("Token org mismatch");
      }
    } else if (subdomain && subdomain !== orgSlug) {
      throw new UnauthorizedError("Token org mismatch");
    }
  }

  return {
    orgId,
    orgSlug,
    userId,
    userRole: role,
    groupIds: [],
  };
}
