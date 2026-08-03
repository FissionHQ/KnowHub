import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@wiki/db";
import { groups } from "@wiki/db";
import type { UserRole } from "@wiki/types";

async function userInCapableGroup(
  db: Db,
  opts: {
    orgId: string;
    userRole: UserRole;
    groupIds: string[];
    flag: "canCreateSpaces" | "canManageGroups";
  },
): Promise<boolean> {
  if (opts.userRole === "admin") return true;
  if (!opts.groupIds.length) return false;

  const rows = await db
    .select({ id: groups.id })
    .from(groups)
    .where(
      and(
        eq(groups.orgId, opts.orgId),
        eq(groups[opts.flag], true),
        inArray(groups.id, opts.groupIds),
      ),
    )
    .limit(1);

  return rows.length > 0;
}

/** Admins always can; others need membership in a group with canCreateSpaces. */
export async function userCanCreateSpaces(
  db: Db,
  opts: {
    orgId: string;
    userRole: UserRole;
    groupIds: string[];
  },
): Promise<boolean> {
  return userInCapableGroup(db, { ...opts, flag: "canCreateSpaces" });
}

/** Admins always can; others need membership in a group with canManageGroups. */
export async function userCanManageGroups(
  db: Db,
  opts: {
    orgId: string;
    userRole: UserRole;
    groupIds: string[];
  },
): Promise<boolean> {
  return userInCapableGroup(db, { ...opts, flag: "canManageGroups" });
}

/** Group ids among `groupIds` that have canCreateSpaces enabled. */
export async function spaceCreatorGroupIds(
  db: Db,
  opts: { orgId: string; groupIds: string[] },
): Promise<string[]> {
  if (!opts.groupIds.length) return [];
  const rows = await db
    .select({ id: groups.id })
    .from(groups)
    .where(
      and(
        eq(groups.orgId, opts.orgId),
        eq(groups.canCreateSpaces, true),
        inArray(groups.id, opts.groupIds),
      ),
    );
  return rows.map((r) => r.id);
}

export type ManageGroupDenialReason =
  | "not_found"
  | "no_capability"
  | "default_group"
  | "not_creator";

/**
 * True when the user may manage this group:
 * - Admin: any group in the org
 * - Others: only if they have canManageGroups AND created the group (never default/others')
 */
export async function userCanManageGroup(
  db: Db,
  opts: {
    orgId: string;
    userId: string;
    userRole: UserRole;
    groupIds: string[];
    groupId: string;
  },
): Promise<{
  allowed: boolean;
  group: typeof groups.$inferSelect | null;
  reason?: ManageGroupDenialReason;
}> {
  const rows = await db
    .select()
    .from(groups)
    .where(and(eq(groups.id, opts.groupId), eq(groups.orgId, opts.orgId)))
    .limit(1);
  const group = rows[0] ?? null;
  if (!group) return { allowed: false, group: null, reason: "not_found" };
  if (opts.userRole === "admin") return { allowed: true, group };

  const canManage = await userCanManageGroups(db, {
    orgId: opts.orgId,
    userRole: opts.userRole,
    groupIds: opts.groupIds,
  });
  if (!canManage) return { allowed: false, group, reason: "no_capability" };
  if (group.isDefault) return { allowed: false, group, reason: "default_group" };
  if (group.createdBy !== opts.userId) {
    return { allowed: false, group, reason: "not_creator" };
  }
  return { allowed: true, group };
}

export function manageGroupForbiddenMessage(reason?: ManageGroupDenialReason): string {
  switch (reason) {
    case "default_group":
      return "Cannot modify the default group";
    case "not_creator":
      return "You can only manage groups you created";
    case "no_capability":
      return "You do not have permission to manage groups";
    default:
      return "Forbidden";
  }
}
