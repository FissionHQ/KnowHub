import { eq } from "drizzle-orm";
import type { Db } from "@wiki/db";
import { spacePermissions, documentPermissions } from "@wiki/db";

export async function resolveIndexAcl(
  db: Db,
  documentId: string,
  spaceId: string,
  ownerId: string,
): Promise<{ aclGroupIds: string[]; aclUserIds: string[] }> {
  const spacePerm = await db
    .select({ groupId: spacePermissions.groupId })
    .from(spacePermissions)
    .where(eq(spacePermissions.spaceId, spaceId));

  const docPerm = await db
    .select({ groupId: documentPermissions.groupId, userId: documentPermissions.userId })
    .from(documentPermissions)
    .where(eq(documentPermissions.documentId, documentId));

  const aclGroupIds = [
    ...new Set([
      ...spacePerm.map((r) => r.groupId),
      ...docPerm.filter((r) => r.groupId).map((r) => r.groupId!),
    ]),
  ];

  const aclUserIds = [
    ...new Set([
      ownerId,
      ...docPerm.filter((r) => r.userId).map((r) => r.userId!),
    ]),
  ];

  return { aclGroupIds, aclUserIds };
}
