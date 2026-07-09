import type { NextFunction, Request, Response } from "express";
import * as jose from "jose";
import { UnauthorizedError } from "../lib/errors.js";
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
      req.tenant = extractTenantContext(payload, req, opts.baseDomain);
      next();
    } catch {
      throw new UnauthorizedError("Invalid or expired token");
    }
  };
}

function extractTenantContext(
  payload: jose.JWTPayload,
  req: Request,
  baseDomain: string,
): TenantContext {
  const orgId = payload["custom:org_id"] as string;
  const orgSlug = payload["custom:org_slug"] as string;
  const userId = payload["sub"] as string;
  const role = payload["custom:role"] as UserRole;

  if (!orgId || !userId) {
    throw new UnauthorizedError("Token missing required claims");
  }

  // Verify subdomain matches token — prevents cross-org token reuse in multi-tenant hosting
  const host = req.headers.host ?? "";
  const subdomain = host.split(".")[0] ?? "";

  if (baseDomain !== "localhost" && subdomain !== orgSlug) {
    throw new UnauthorizedError("Token org mismatch");
  }

  return {
    orgId,
    orgSlug,
    userId,
    userRole: role,
    groupIds: [], // Populated by tenantContext middleware after DB lookup
  };
}
