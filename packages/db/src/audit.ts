import { randomUUID } from "node:crypto";
import type { Db } from "./client.js";
import { auditLog } from "./schema.js";

export async function recordAudit(
  db: Db,
  opts: {
    orgId: string;
    actorId?: string | null;
    action: string;
    target?: Record<string, unknown>;
    ipAddress?: string | null;
  },
): Promise<void> {
  await db.insert(auditLog).values({
    id: randomUUID(),
    orgId: opts.orgId,
    actorId: opts.actorId ?? null,
    action: opts.action,
    target: opts.target ?? {},
    ipAddress: opts.ipAddress ?? null,
  });
}
