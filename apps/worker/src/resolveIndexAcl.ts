import { eq } from "drizzle-orm";
import type { Db } from "@wiki/db";
import { spacePermissions, documentPermissions } from "@wiki/db";

/**
 * Denormalized search ACL.
 * - No document overrides: all space groups (+ owner) may discover the document.
 * - With overrides: only listed groups/users (+ owner) — hides from other space members.
 */
export async function resolveIndexAcl(
  db: Db,
  documentId: string,
  spaceId: string,
  ownerId: string,
): Promise<{ aclGroupIds: string[]; aclUserIds: string[] }> {
  const docPerm = await db
    .select({ groupId: documentPermissions.groupId, userId: documentPermissions.userId })
    .from(documentPermissions)
    .where(eq(documentPermissions.documentId, documentId));

  const aclUserIds = [
    ...new Set([
      ownerId,
      ...docPerm.filter((r) => r.userId).map((r) => r.userId!),
    ]),
  ];

  if (docPerm.length) {
    const aclGroupIds = [
      ...new Set(docPerm.filter((r) => r.groupId).map((r) => r.groupId!)),
    ];
    return { aclGroupIds, aclUserIds };
  }

  const spacePerm = await db
    .select({ groupId: spacePermissions.groupId })
    .from(spacePermissions)
    .where(eq(spacePermissions.spaceId, spaceId));

  const aclGroupIds = [...new Set(spacePerm.map((r) => r.groupId))];
  return { aclGroupIds, aclUserIds };
}
