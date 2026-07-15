import { and, eq, lt } from "drizzle-orm";
import type { Db } from "./client.js";
import { auditLog, organizations } from "./schema.js";

/** Deletes audit rows older than each org's auditRetentionDays setting. */
export async function purgeExpiredAuditLogs(db: Db): Promise<void> {
  const orgs = await db
    .select({
      id: organizations.id,
      auditRetentionDays: organizations.auditRetentionDays,
    })
    .from(organizations);

  for (const org of orgs) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - org.auditRetentionDays);

    await db
      .delete(auditLog)
      .where(and(eq(auditLog.orgId, org.id), lt(auditLog.timestamp, cutoff)));
  }
}
