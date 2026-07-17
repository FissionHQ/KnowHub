import type { Db } from "@wiki/db";
import { documentPermissions, spacePermissions } from "@wiki/db";
import { eq, and, inArray, or } from "drizzle-orm";
import type { AccessLevel, UserRole } from "@wiki/types";
import { ForbiddenError } from "../../lib/errors.js";

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

/**
 * Resolves the effective access level for a user on a document.
 *
 * Requires space-level access first (space_permissions). Document overrides
 * only refine access after that gate.
 *
 * Per group: document override (if any) else space permission.
 * User-specific document override wins outright.
 *
 * Document-level "view" on any of the user's groups caps access to view
 * unless another of the user's groups has document-level "edit" on this doc.
 */
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

/** Space IDs the user may access. null = admin (all spaces in org). */
export async function resolveAccessibleSpaceIds(
  opts: PermissionCheck,
): Promise<string[] | null> {
  if (opts.userRole === "admin") return null;
  if (!opts.groupIds.length) return [];

  const rows = await opts.db
    .select({ spaceId: spacePermissions.spaceId })
    .from(spacePermissions)
    .where(inArray(spacePermissions.groupId, opts.groupIds));

  return [...new Set(rows.map((r) => r.spaceId))];
}

/** Admin or document owner may change document-level permissions. */
export function assertCanManageDocumentPermissions(opts: {
  userRole: UserRole;
  userId: string;
  ownerId: string;
}): void {
  if (opts.userRole === "admin") return;
  if (opts.userRole === "member" && opts.userId === opts.ownerId) return;
  throw new ForbiddenError();
}

/**
 * Members may edit/delete own documents or documents their groups can edit.
 * Viewers cannot mutate content.
 */
export async function assertCanMutateDocumentContent(
  opts: PermissionCheck & { documentId: string; spaceId: string; ownerId: string },
): Promise<void> {
  if (opts.userRole === "admin") return;
  if (opts.userRole === "viewer") throw new ForbiddenError();
  if (opts.userRole === "member" && opts.userId === opts.ownerId) return;

  await assertDocumentAccess({
    db: opts.db,
    userRole: opts.userRole,
    userId: opts.userId,
    groupIds: opts.groupIds,
    documentId: opts.documentId,
    spaceId: opts.spaceId,
    required: "edit",
  });
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
