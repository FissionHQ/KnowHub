import type { Db } from "@wiki/db";
import { documentPermissions, documents, spacePermissions } from "@wiki/db";
import { eq, and, inArray } from "drizzle-orm";
import type { AccessLevel, UserRole } from "@wiki/types";
import { ForbiddenError } from "../../lib/errors.js";

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

/**
 * Resolves effective document access.
 *
 * - No document overrides: inherit parent space group ACL (default-deny without space access).
 * - With document overrides: only listed groups/users (+ owner, admin) may access; space
 *   membership alone is not enough.
 */
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

/** Space IDs visible via group membership. null = admin (all spaces in org). */
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

/** Returns true if the user may view the document (does not throw). */
export async function canViewDocument(
  opts: PermissionCheck & { documentId: string; spaceId: string; ownerId: string },
): Promise<boolean> {
  try {
    await resolveDocumentAccess(opts);
    return true;
  } catch {
    return false;
  }
}

/** Filter a list of documents to those the caller may view. */
export async function filterViewableDocuments<
  T extends { id: string; spaceId: string; ownerId: string },
>(opts: PermissionCheck, docs: T[]): Promise<T[]> {
  if (opts.userRole === "admin") return docs;
  if (!docs.length) return [];

  const docIds = docs.map((d) => d.id);
  const allPerms = await opts.db
    .select({
      documentId: documentPermissions.documentId,
      accessLevel: documentPermissions.accessLevel,
      userId: documentPermissions.userId,
      groupId: documentPermissions.groupId,
    })
    .from(documentPermissions)
    .where(inArray(documentPermissions.documentId, docIds));

  const permsByDoc = new Map<string, DocPermRow[]>();
  for (const row of allPerms) {
    const list = permsByDoc.get(row.documentId) ?? [];
    list.push({
      accessLevel: row.accessLevel,
      userId: row.userId,
      groupId: row.groupId,
    });
    permsByDoc.set(row.documentId, list);
  }

  const visible: T[] = [];
  for (const doc of docs) {
    const docPerms = permsByDoc.get(doc.id) ?? [];
    try {
      if (docPerms.length) {
        resolveRestrictedDocumentAccess({ ...opts, ownerId: doc.ownerId }, docPerms);
      } else {
        await resolveInheritedDocumentAccess({
          ...opts,
          spaceId: doc.spaceId,
          ownerId: doc.ownerId,
        });
      }
      visible.push(doc);
    } catch {
      // hidden
    }
  }
  return visible;
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

/** Non-admins cannot grant or change document permissions for admins or themselves. */
export function assertCanGrantDocumentPermissionToUser(opts: {
  actorRole: UserRole;
  actorId: string;
  targetUserId: string;
  targetUserRole: UserRole;
}): void {
  if (opts.actorId === opts.targetUserId) {
    throw new ForbiddenError("Cannot manage document permissions for yourself");
  }
  if (opts.targetUserRole === "admin" && opts.actorRole !== "admin") {
    throw new ForbiddenError("Only admins can manage permissions for admin users");
  }
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
    ownerId: opts.ownerId,
    required: "edit",
  });
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

/** Space IDs for documents shared directly with this user (no group space access). */
export async function resolveDocumentSharedSpaceIds(
  db: Db,
  userId: string,
  orgId: string,
): Promise<string[]> {
  const rows = await db
    .select({ spaceId: documents.spaceId })
    .from(documentPermissions)
    .innerJoin(documents, eq(documentPermissions.documentId, documents.id))
    .where(
      and(
        eq(documentPermissions.userId, userId),
        eq(documents.orgId, orgId),
      ),
    );
  return [...new Set(rows.map((r) => r.spaceId))];
}

/** True when the user may run search (has group, doc share, or is admin). */
export async function canRunSearch(opts: PermissionCheck & { orgId: string }): Promise<boolean> {
  if (opts.userRole === "admin") return true;
  if (opts.groupIds.length > 0) return true;

  const shared = await resolveDocumentSharedSpaceIds(opts.db, opts.userId, opts.orgId);
  return shared.length > 0;
}
