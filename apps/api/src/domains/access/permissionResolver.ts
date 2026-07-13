import type { Db } from "@wiki/db";
import { documentPermissions, spacePermissions, documents } from "@wiki/db";
import { eq, and, inArray, or, isNull } from "drizzle-orm";
import type { AccessLevel, UserRole } from "@wiki/types";
import { ForbiddenError } from "../../lib/errors.js";

export interface PermissionCheck {
  db: Db;
  userRole: UserRole;
  userId: string;
  groupIds: string[];
}

/**
 * Resolves whether a user can perform `required` action on a document.
 * Checks document-level overrides first, then falls back to space-level ACL.
 * Admins bypass group checks (but not cross-tenant — RLS handles that).
 */
export async function assertDocumentAccess(
  opts: PermissionCheck & {
    documentId: string;
    spaceId: string;
    required: AccessLevel;
  },
): Promise<void> {
  if (opts.userRole === "admin") return;

  // Check document-level override
  const docOverrides = await opts.db
    .select({ accessLevel: documentPermissions.accessLevel })
    .from(documentPermissions)
    .where(
      and(
        eq(documentPermissions.documentId, opts.documentId),
        or(
          inArray(documentPermissions.groupId, opts.groupIds.length ? opts.groupIds : [""]),
          eq(documentPermissions.userId, opts.userId),
        ),
      ),
    );

  if (docOverrides.length > 0) {
    const bestLevel = docOverrides.some((r) => r.accessLevel === "edit") ? "edit" : "view";
    if (!satisfies(bestLevel, opts.required)) throw new ForbiddenError();
    return;
  }

  // Fall back to space-level ACL
  await assertSpaceAccess({ ...opts, spaceId: opts.spaceId });
}

export async function assertSpaceAccess(
  opts: PermissionCheck & { spaceId: string; required: AccessLevel },
): Promise<void> {
  if (opts.userRole === "admin") return;

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

  const bestLevel = rows.some((r) => r.accessLevel === "edit") ? "edit" : "view";
  if (!satisfies(bestLevel, opts.required)) throw new ForbiddenError();
}

function satisfies(granted: AccessLevel, required: AccessLevel): boolean {
  if (required === "view") return true;
  return granted === "edit";
}

/** True if user is admin, document owner, or has edit access on the document/space. */
export async function canEditDocument(
  opts: PermissionCheck & {
    documentId: string;
    spaceId: string;
    ownerId: string;
  },
): Promise<boolean> {
  if (opts.userRole === "admin") return true;
  if (opts.ownerId === opts.userId) return true;

  try {
    await assertDocumentAccess({ ...opts, required: "edit" });
    return true;
  } catch {
    return false;
  }
}

/** True if user is admin, document owner, or has edit access on the document/space. */
export async function canDeleteDocument(
  opts: PermissionCheck & {
    documentId: string;
    spaceId: string;
    ownerId: string;
  },
): Promise<boolean> {
  if (opts.userRole === "admin") return true;
  if (opts.ownerId === opts.userId) return true;

  try {
    await assertDocumentAccess({ ...opts, required: "edit" });
    return true;
  } catch {
    return false;
  }
}
