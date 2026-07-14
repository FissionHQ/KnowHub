import * as jose from "jose";
import { eq, and } from "drizzle-orm";
import type { Redis } from "ioredis";
import type { Db } from "@wiki/db";
import { documents, groupMemberships, groups, users, setTenantContext } from "@wiki/db";
import type { UserRole } from "@wiki/types";
import { assertDocumentAccess, resolveDocumentAccess } from "./permissions.js";

export interface CollabUser {
  id: string;
  name: string;
  color: string;
  canEdit: boolean;
}

export interface CollabAuthContext {
  orgId: string;
  documentId: string;
  userId: string;
  userRole: UserRole;
  groupIds: string[];
  user: CollabUser;
}

const CACHE_TTL_SECONDS = 30;

function cacheKey(orgId: string, userId: string) {
  return `acl:groups:${orgId}:${userId}`;
}

async function loadGroupIds(
  db: Db,
  redis: Redis,
  orgId: string,
  userId: string,
): Promise<string[]> {
  const cached = await redis.get(cacheKey(orgId, userId));
  if (cached) return JSON.parse(cached) as string[];

  await setTenantContext(db, orgId);
  const rows = await db
    .select({ groupId: groupMemberships.groupId })
    .from(groupMemberships)
    .innerJoin(groups, eq(groupMemberships.groupId, groups.id))
    .where(and(eq(groupMemberships.userId, userId), eq(groups.orgId, orgId)));

  const groupIds = rows.map((r) => r.groupId);
  await redis.set(cacheKey(orgId, userId), JSON.stringify(groupIds), "EX", CACHE_TTL_SECONDS);
  return groupIds;
}

export function colorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 65% 45%)`;
}

export function parseDocumentName(documentName: string): { orgId: string; documentId: string } {
  const [orgId, documentId] = documentName.split(":");
  if (!orgId || !documentId) {
    throw new Error("Invalid document room name");
  }
  return { orgId, documentId };
}

export async function authenticateCollabConnection(
  db: Db,
  redis: Redis,
  jwtSecret: string,
  token: string,
  documentName: string,
): Promise<CollabAuthContext> {
  if (!token) throw new Error("Missing collaboration token");

  const secret = new TextEncoder().encode(jwtSecret);
  const { payload } = await jose.jwtVerify(token, secret);

  const orgId = payload["custom:org_id"] as string;
  const userId = payload["sub"] as string;
  const userRole = payload["custom:role"] as UserRole;

  if (!orgId || !userId) throw new Error("Token missing required claims");

  const { orgId: roomOrgId, documentId } = parseDocumentName(documentName);
  if (roomOrgId !== orgId) throw new Error("Document room org mismatch");

  await setTenantContext(db, orgId);
  const docRows = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.orgId, orgId)));

  if (!docRows.length) throw new Error("Document not found");
  const doc = docRows[0]!;

  const groupIds = await loadGroupIds(db, redis, orgId, userId);

  await assertDocumentAccess({
    db,
    userRole,
    userId,
    groupIds,
    documentId: doc.id,
    spaceId: doc.spaceId,
    required: "view",
  });

  const accessLevel = await resolveDocumentAccess({
    db,
    userRole,
    userId,
    groupIds,
    documentId: doc.id,
    spaceId: doc.spaceId,
  });
  const canEdit = accessLevel === "edit";

  const userRows = await db
    .select({ name: users.name })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.orgId, orgId)));

  const name = userRows[0]?.name ?? "Unknown";

  return {
    orgId,
    documentId,
    userId,
    userRole,
    groupIds,
    user: {
      id: userId,
      name,
      color: colorForUser(userId),
      canEdit,
    },
  };
}
