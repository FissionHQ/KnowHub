import type { NextFunction, Request, Response } from "express";
import type { Db } from "@wiki/db";
import { groupMemberships, groups, users } from "@wiki/db";
import { eq, and } from "drizzle-orm";
import type { Redis } from "ioredis";
import { setTenantContext } from "@wiki/db";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";

const CACHE_TTL_SECONDS = 30;

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

    // Fetch user's group IDs (cached in Redis)
    const cached = await redis.get(cacheKey(orgId, userId));
    if (cached) {
      req.tenant.groupIds = JSON.parse(cached) as string[];
    } else {
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

      const groupIds = rows.map((r) => r.groupId);
      req.tenant.groupIds = groupIds;
      await redis.set(cacheKey(orgId, userId), JSON.stringify(groupIds), "EX", CACHE_TTL_SECONDS);
    }

    next();
  };
}

/**
 * Invalidates the group membership cache for a user.
 * Called whenever group membership changes.
 */
export async function invalidateGroupCache(
  redis: Redis,
  orgId: string,
  userId: string,
): Promise<void> {
  await redis.del(cacheKey(orgId, userId));
  // Publish invalidation event to all API instances
  await redis.publish(`acl-invalidate:${orgId}`, userId);
}
