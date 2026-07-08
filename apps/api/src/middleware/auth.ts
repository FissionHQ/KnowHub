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

let jwksCache: ReturnType<typeof jose.createRemoteJWKSet> | null = null;

function getJwks(userPoolId: string, region: string) {
  if (!jwksCache) {
    const url = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;
    jwksCache = jose.createRemoteJWKSet(new URL(url));
  }
  return jwksCache;
}

export function createAuthMiddleware(opts: {
  userPoolId: string;
  clientId: string;
  region: string;
  devMode?: boolean;
}) {
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

    // In dev mode with JWT_SECRET, verify as HS256 (allows testing without Cognito)
    if (opts.devMode && process.env["JWT_SECRET"]) {
      try {
        const secret = new TextEncoder().encode(process.env["JWT_SECRET"]);
        const { payload } = await jose.jwtVerify(token, secret);
        req.tenant = extractTenantContext(payload, req);
        next();
        return;
      } catch {
        // Fall through to Cognito verification
      }
    }

    try {
      const jwks = getJwks(opts.userPoolId, opts.region);
      const { payload } = await jose.jwtVerify(token, jwks, {
        audience: opts.clientId,
      });
      req.tenant = extractTenantContext(payload, req);
      next();
    } catch (err) {
      throw new UnauthorizedError("Invalid or expired token");
    }
  };
}

function extractTenantContext(
  payload: jose.JWTPayload,
  req: Request,
): TenantContext {
  const orgId = payload["custom:org_id"] as string;
  const orgSlug = payload["custom:org_slug"] as string;
  const userId = payload["sub"] as string;
  const role = payload["custom:role"] as UserRole;

  if (!orgId || !userId) {
    throw new UnauthorizedError("Token missing required claims");
  }

  // Verify subdomain matches token — prevents cross-org token reuse
  const host = req.headers.host ?? "";
  const subdomain = host.split(".")[0] ?? "";
  const baseDomain = process.env["BASE_DOMAIN"] ?? "localhost";

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
