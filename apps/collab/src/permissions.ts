import type { Db } from "@wiki/db";
import { documentPermissions, spacePermissions } from "@wiki/db";
import { eq, and, inArray, or } from "drizzle-orm";
import type { AccessLevel, UserRole } from "@wiki/types";

export interface PermissionCheck {
  db: Db;
  userRole: UserRole;
  userId: string;
  groupIds: string[];
}

function documentPermissionMatch(userId: string, groupIds: string[]) {
  return or(
    eq(documentPermissions.userId, userId),
    ...(groupIds.length ? [inArray(documentPermissions.groupId, groupIds)] : []),
  );
}

export async function resolveDocumentAccess(
  opts: PermissionCheck & { documentId: string; spaceId: string },
): Promise<AccessLevel> {
  if (opts.userRole === "admin") return "edit";

  await resolveSpaceAccess({
    db: opts.db,
    userRole: opts.userRole,
    userId: opts.userId,
    groupIds: opts.groupIds,
    spaceId: opts.spaceId,
  });

  if (opts.userRole === "viewer") return "view";

  const docOverrides = await opts.db
    .select({
      accessLevel: documentPermissions.accessLevel,
      userId: documentPermissions.userId,
      groupId: documentPermissions.groupId,
    })
    .from(documentPermissions)
    .where(
      and(
        eq(documentPermissions.documentId, opts.documentId),
        documentPermissionMatch(opts.userId, opts.groupIds),
      ),
    );

  const userOverride = docOverrides.find((row) => row.userId === opts.userId);
  if (userOverride) return userOverride.accessLevel;

  if (!opts.groupIds.length) throw new ForbiddenError();

  const docByGroup = new Map<string, AccessLevel>();
  for (const row of docOverrides) {
    if (row.groupId && opts.groupIds.includes(row.groupId)) {
      docByGroup.set(row.groupId, row.accessLevel);
    }
  }

  const spaceRows = await opts.db
    .select({
      groupId: spacePermissions.groupId,
      accessLevel: spacePermissions.accessLevel,
    })
    .from(spacePermissions)
    .where(
      and(
        eq(spacePermissions.spaceId, opts.spaceId),
        inArray(spacePermissions.groupId, opts.groupIds),
      ),
    );

  const spaceByGroup = new Map(spaceRows.map((row) => [row.groupId, row.accessLevel]));

  const levels: AccessLevel[] = [];
  for (const groupId of opts.groupIds) {
    const docLevel = docByGroup.get(groupId);
    if (docLevel) {
      levels.push(docLevel);
    } else {
      const spaceLevel = spaceByGroup.get(groupId);
      if (spaceLevel) levels.push(spaceLevel);
    }
  }

  if (!levels.length) throw new ForbiddenError();

  const hasDocView = opts.groupIds.some((g) => docByGroup.get(g) === "view");
  const hasDocEdit = opts.groupIds.some((g) => docByGroup.get(g) === "edit");

  if (hasDocView && !hasDocEdit) {
    return "view";
  }

  return levels.some((level) => level === "edit") ? "edit" : "view";
}

export async function resolveSpaceAccess(
  opts: PermissionCheck & { spaceId: string },
): Promise<AccessLevel> {
  if (opts.userRole === "admin") return "edit";
  if (!opts.groupIds.length) throw new ForbiddenError();

  const rows = await opts.db
    .select({ accessLevel: spacePermissions.accessLevel })
    .from(spacePermissions)
    .where(
      and(
        eq(spacePermissions.spaceId, opts.spaceId),
        inArray(spacePermissions.groupId, opts.groupIds),
      ),
    );

  if (!rows.length) throw new ForbiddenError();

  if (opts.userRole === "viewer") return "view";

  return rows.some((r) => r.accessLevel === "edit") ? "edit" : "view";
}

export async function assertDocumentAccess(
  opts: PermissionCheck & {
    documentId: string;
    spaceId: string;
    required: AccessLevel;
  },
): Promise<void> {
  if (opts.userRole === "admin") return;

  const granted = await resolveDocumentAccess(opts);
  if (!satisfies(granted, opts.required)) throw new ForbiddenError();
}

export async function assertSpaceAccess(
  opts: PermissionCheck & { spaceId: string; required: AccessLevel },
): Promise<void> {
  if (opts.userRole === "admin") return;

  const granted = await resolveSpaceAccess(opts);
  if (!satisfies(granted, opts.required)) throw new ForbiddenError();
}

function satisfies(granted: AccessLevel, required: AccessLevel): boolean {
  if (required === "view") return true;
  return granted === "edit";
}

class ForbiddenError extends Error {
  constructor() {
    super("Forbidden");
    this.name = "ForbiddenError";
  }
}
