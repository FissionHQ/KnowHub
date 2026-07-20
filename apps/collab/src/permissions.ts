import type { Db } from "@wiki/db";
import { documentPermissions, spacePermissions } from "@wiki/db";
import { eq, and, inArray } from "drizzle-orm";
import type { AccessLevel, UserRole } from "@wiki/types";

export interface PermissionCheck {
  db: Db;
  userRole: UserRole;
  userId: string;
  groupIds: string[];
}

type DocPermRow = {
  accessLevel: AccessLevel;
  userId: string | null;
  groupId: string | null;
};

function capForViewer(role: UserRole, level: AccessLevel): AccessLevel {
  return role === "viewer" ? "view" : level;
}

async function loadDocumentPermissions(
  db: Db,
  documentId: string,
): Promise<DocPermRow[]> {
  return db
    .select({
      accessLevel: documentPermissions.accessLevel,
      userId: documentPermissions.userId,
      groupId: documentPermissions.groupId,
    })
    .from(documentPermissions)
    .where(eq(documentPermissions.documentId, documentId));
}

function resolveRestrictedDocumentAccess(
  opts: PermissionCheck & { ownerId: string },
  allDocPerms: DocPermRow[],
): AccessLevel {
  const userOverride = allDocPerms.find((row) => row.userId === opts.userId);
  if (userOverride) return capForViewer(opts.userRole, userOverride.accessLevel);

  if (opts.userId === opts.ownerId) return capForViewer(opts.userRole, "edit");

  const docByGroup = new Map<string, AccessLevel>();
  for (const row of allDocPerms) {
    if (row.groupId && opts.groupIds.includes(row.groupId)) {
      docByGroup.set(row.groupId, row.accessLevel);
    }
  }

  if (!docByGroup.size) throw new ForbiddenError();

  const levels = [...docByGroup.values()];
  const hasDocView = [...docByGroup.values()].some((l) => l === "view");
  const hasDocEdit = [...docByGroup.values()].some((l) => l === "edit");

  if (hasDocView && !hasDocEdit) {
    return capForViewer(opts.userRole, "view");
  }

  const level = levels.some((l) => l === "edit") ? "edit" : "view";
  return capForViewer(opts.userRole, level);
}

async function resolveInheritedDocumentAccess(
  opts: PermissionCheck & { spaceId: string; ownerId: string },
): Promise<AccessLevel> {
  if (opts.userId === opts.ownerId) return capForViewer(opts.userRole, "edit");

  await resolveSpaceAccess({
    db: opts.db,
    userRole: opts.userRole,
    userId: opts.userId,
    groupIds: opts.groupIds,
    spaceId: opts.spaceId,
  });

  if (opts.userRole === "viewer") return "view";

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

  if (!spaceRows.length) throw new ForbiddenError();

  return spaceRows.some((r) => r.accessLevel === "edit") ? "edit" : "view";
}

export async function resolveDocumentAccess(
  opts: PermissionCheck & { documentId: string; spaceId: string; ownerId: string },
): Promise<AccessLevel> {
  if (opts.userRole === "admin") return "edit";

  const allDocPerms = await loadDocumentPermissions(opts.db, opts.documentId);

  if (allDocPerms.length) {
    return resolveRestrictedDocumentAccess(opts, allDocPerms);
  }

  return resolveInheritedDocumentAccess(opts);
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
    ownerId: string;
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
