import type { Request } from "express";
import type { Db } from "@wiki/db";
import { recordAudit as recordAuditDb } from "@wiki/db";
import type { AuditAction } from "@wiki/types";

export async function recordAudit(
  db: Db,
  opts: {
    orgId: string;
    actorId?: string | null;
    action: AuditAction;
    target?: Record<string, unknown>;
    req?: Request;
  },
): Promise<void> {
  await recordAuditDb(db, {
    orgId: opts.orgId,
    ...(opts.actorId !== undefined ? { actorId: opts.actorId } : {}),
    action: opts.action,
    ...(opts.target !== undefined ? { target: opts.target } : {}),
    ipAddress: opts.req?.ip ?? null,
  });
}
