import { and, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { Db } from "@wiki/db";
import { groups } from "@wiki/db";
import { ValidationError } from "../../lib/errors.js";

/** Returns the org default group id, creating "Everyone" if missing. */
export async function ensureDefaultGroup(db: Db, orgId: string): Promise<string> {
  const existing = await db
    .select({ id: groups.id })
    .from(groups)
    .where(and(eq(groups.orgId, orgId), eq(groups.isDefault, true)))
    .limit(1);

  if (existing[0]) return existing[0].id;

  const id = uuidv4();
  await db.insert(groups).values({
    id,
    orgId,
    name: "Everyone",
    description: "Default group — every user is a member. Space access is set per space.",
    isDefault: true,
  });
  return id;
}

export async function requireDefaultGroup(db: Db, orgId: string): Promise<string> {
  const rows = await db
    .select({ id: groups.id, isDefault: groups.isDefault })
    .from(groups)
    .where(and(eq(groups.orgId, orgId), eq(groups.isDefault, true)))
    .limit(1);

  if (!rows[0]) {
    throw new ValidationError("Organization has no default group");
  }
  return rows[0].id;
}

export async function isDefaultGroup(
  db: Db,
  orgId: string,
  groupId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: groups.id })
    .from(groups)
    .where(
      and(
        eq(groups.id, groupId),
        eq(groups.orgId, orgId),
        eq(groups.isDefault, true),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
