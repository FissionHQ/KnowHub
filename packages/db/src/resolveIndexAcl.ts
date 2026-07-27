import { eq } from "drizzle-orm";
import type { Db } from "./client.js";
import { spacePermissions, documentPermissions } from "./schema.js";

/**
 * Denormalized search ACL. Must mirror resolveDocumentAccess so search results match page access.
 * - visibility "inherit" (default): union of space groups + document-override groups/users (+ owner).
 * - visibility "restricted": only document-override groups/users (+ owner).
 */
export async function resolveIndexAcl(
  db: Db,
  documentId: string,
  spaceId: string,
  ownerId: string,
  visibility: "inherit" | "restricted" = "inherit",
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
  const docGroupIds = docPerm.filter((r) => r.groupId).map((r) => r.groupId!);

  if (visibility === "restricted") {
    return { aclGroupIds: [...new Set(docGroupIds)], aclUserIds };
  }

  const spacePerm = await db
    .select({ groupId: spacePermissions.groupId })
    .from(spacePermissions)
    .where(eq(spacePermissions.spaceId, spaceId));

  const aclGroupIds = [...new Set([...spacePerm.map((r) => r.groupId), ...docGroupIds])];
  return { aclGroupIds, aclUserIds };
}
