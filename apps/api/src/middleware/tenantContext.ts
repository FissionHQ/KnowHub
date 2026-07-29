import type { NextFunction, Request, Response } from "express";
import type { Db } from "@wiki/db";
import { groupMemberships, groups, users } from "@wiki/db";
import { eq, and } from "drizzle-orm";
import type { Redis } from "ioredis";
import { setTenantContext } from "@wiki/db";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

const CACHE_TTL_SECONDS = 30;
// Jitter added on top of the base TTL so that many users' cache entries do not
// expire at the same instant and stampede the database. Effective TTL: 30–37 s.
const CACHE_TTL_JITTER_SECONDS = 7;

function cacheTtlSeconds(): number {
  return CACHE_TTL_SECONDS + Math.floor(Math.random() * (CACHE_TTL_JITTER_SECONDS + 1));
}

function cacheKey(orgId: string, userId: string) {
  return `acl:groups:${orgId}:${userId}`;
}

export function createTenantContextMiddleware(db: Db, redis: Redis) {
  return async function tenantContextMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    const { orgId, userId } = req.tenant;

    const userRows = await db
      .select({ status: users.status })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.orgId, orgId)));
    if (!userRows.length) throw new UnauthorizedError("User not found");
    if (userRows[0]!.status === "deactivated") {
      throw new ForbiddenError("Account is deactivated");
    }
    if (userRows[0]!.status === "invited") {
      throw new ForbiddenError("Please accept your invitation");
    }

    // Set RLS context for this request's DB session
    await setTenantContext(db, orgId);

    // Fetch user's group IDs (cached in Redis). The cache is a best-effort
    // optimization: if Redis is unavailable we fall back to the database rather
    // than failing the request.
    let groupIds: string[] | null = null;
    try {
      const cached = await redis.get(cacheKey(orgId, userId));
      if (cached) groupIds = JSON.parse(cached) as string[];
    } catch (err) {
      logger.warn("Group cache read failed; falling back to database", { err });
    }

    if (groupIds === null) {
      const rows = await db
        .select({ groupId: groupMemberships.groupId })
        .from(groupMemberships)
        .innerJoin(groups, eq(groupMemberships.groupId, groups.id))
        .where(
          and(
            eq(groupMemberships.userId, userId),
            eq(groups.orgId, orgId),
          ),
        );

      groupIds = rows.map((r) => r.groupId);
      try {
        await redis.set(
          cacheKey(orgId, userId),
          JSON.stringify(groupIds),
          "EX",
          cacheTtlSeconds(),
        );
      } catch (err) {
        logger.warn("Group cache write failed", { err });
      }
    }

    req.tenant.groupIds = groupIds;

    next();
  };
}

/**
 * Invalidates the group membership cache for a user.
 * Called whenever group membership changes.
 *
 * The cache lives in shared Redis, so a single DEL drops the entry for every API
 * instance. If the DEL fails the TTL is the backstop, so we log and continue
 * rather than failing the caller's mutation.
 */
export async function invalidateGroupCache(
  redis: Redis,
  orgId: string,
  userId: string,
): Promise<void> {
  try {
    await redis.del(cacheKey(orgId, userId));
  } catch (err) {
    logger.warn("Group cache invalidation failed; relying on TTL", { err });
  }
}
