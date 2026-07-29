import type { Db } from "@wiki/db";
import { documentPermissions, documents, spacePermissions } from "@wiki/db";
import { eq, and, inArray } from "drizzle-orm";
import type { AccessLevel, UserRole } from "@wiki/types";
import { ForbiddenError } from "../../lib/errors.js";

export type DocumentVisibility = "inherit" | "restricted";

/** Loads a document's visibility mode (defaults to "inherit" if the row is missing). */
async function loadDocumentVisibility(
  db: Db,
  documentId: string,
): Promise<DocumentVisibility> {
  const rows = await db
    .select({ visibility: documents.visibility })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  return (rows[0]?.visibility as DocumentVisibility | undefined) ?? "inherit";
}

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

/**
 * Additive access (visibility = "inherit"):
 * effective access = space-inherited access UNION document overrides, taking the highest level.
 * Overrides only ever ADD access (extra people or view->edit); they never restrict, so an
 * individual share sits "on top of" the group-based space defaults.
 */
async function resolveAdditiveDocumentAccess(
  opts: PermissionCheck & { spaceId: string; ownerId: string },
  allDocPerms: DocPermRow[],
): Promise<AccessLevel> {
  if (opts.userId === opts.ownerId) return capForViewer(opts.userRole, "edit");

  const levels: AccessLevel[] = [];

  // Document-level overrides matching this user (individual share or group share).
  const userOverride = allDocPerms.find((row) => row.userId === opts.userId);
  if (userOverride) levels.push(userOverride.accessLevel);
  for (const row of allDocPerms) {
    if (row.groupId && opts.groupIds.includes(row.groupId)) levels.push(row.accessLevel);
  }

  // Inherited space access — unlike resolveInheritedDocumentAccess this does NOT throw when
  // absent, because doc overrides alone may still grant access.
  if (opts.groupIds.length) {
    const spaceRows = await opts.db
      .select({ accessLevel: spacePermissions.accessLevel })
      .from(spacePermissions)
      .where(
        and(
          eq(spacePermissions.spaceId, opts.spaceId),
          inArray(spacePermissions.groupId, opts.groupIds),
        ),
      );
    for (const row of spaceRows) levels.push(row.accessLevel);
  }

  if (!levels.length) throw new ForbiddenError();

  return capForViewer(opts.userRole, levels.some((l) => l === "edit") ? "edit" : "view");
}

/**
 * Resolves effective document access based on the document's visibility mode.
 *
 * - "inherit" (default): additive — space-inherited access UNION document overrides.
 * - "restricted": whitelist — only listed groups/users (+ owner, admin); space membership
 *   alone is not enough.
 *
 * `visibility` may be supplied by the caller (which usually already has the doc row); if
 * omitted it is loaded from the database.
 */
export async function resolveDocumentAccess(
  opts: PermissionCheck & {
    documentId: string;
    spaceId: string;
    ownerId: string;
    visibility?: DocumentVisibility;
  },
): Promise<AccessLevel> {
  if (opts.userRole === "admin") return "edit";

  const allDocPerms = await loadDocumentPermissions(opts.db, opts.documentId);
  const visibility = opts.visibility ?? (await loadDocumentVisibility(opts.db, opts.documentId));

  if (visibility === "restricted") {
    return resolveRestrictedDocumentAccess(opts, allDocPerms);
  }

  return resolveAdditiveDocumentAccess(opts, allDocPerms);
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

  // Batch-load visibility so we do not query per document.
  const visRows = await opts.db
    .select({ id: documents.id, visibility: documents.visibility })
    .from(documents)
    .where(inArray(documents.id, docIds));
  const visibilityByDoc = new Map<string, DocumentVisibility>();
  for (const row of visRows) {
    visibilityByDoc.set(row.id, (row.visibility as DocumentVisibility) ?? "inherit");
  }

  const visible: T[] = [];
  for (const doc of docs) {
    const docPerms = permsByDoc.get(doc.id) ?? [];
    const visibility = visibilityByDoc.get(doc.id) ?? "inherit";
    try {
      if (visibility === "restricted") {
        resolveRestrictedDocumentAccess({ ...opts, ownerId: doc.ownerId }, docPerms);
      } else {
        await resolveAdditiveDocumentAccess(
          { ...opts, spaceId: doc.spaceId, ownerId: doc.ownerId },
          docPerms,
        );
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
  opts: PermissionCheck & {
    documentId: string;
    spaceId: string;
    ownerId: string;
    visibility?: DocumentVisibility;
  },
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
    ...(opts.visibility !== undefined ? { visibility: opts.visibility } : {}),
    required: "edit",
  });
}

export async function assertDocumentAccess(
  opts: PermissionCheck & {
    documentId: string;
    spaceId: string;
    ownerId: string;
    visibility?: DocumentVisibility;
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
