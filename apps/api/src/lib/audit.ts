import { v4 as uuidv4 } from "uuid";
import type { Request } from "express";
import type { Db } from "@wiki/db";
import { auditLog } from "@wiki/db";
import type { AuditAction } from "@wiki/types";

export async function recordAudit(
  db: Db,
  opts: {
    orgId: string;
    actorId: string;
    action: AuditAction;
    target?: Record<string, unknown>;
    req?: Request;
  },
): Promise<void> {
  await db.insert(auditLog).values({
    id: uuidv4(),
    orgId: opts.orgId,
    actorId: opts.actorId,
    action: opts.action,
    target: opts.target ?? {},
    ipAddress: opts.req?.ip ?? null,
  });
}
