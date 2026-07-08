import { Router } from "express";
import { z } from "zod";
import { eq, and, isNull, gt } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { Db } from "@wiki/db";
import { users, inviteTokens, groupMemberships, organizations } from "@wiki/db";
import type { ApiEnv } from "@wiki/config";
import type { SESClient } from "@aws-sdk/client-ses";
import { ValidationError, NotFoundError, ForbiddenError, ConflictError } from "../../lib/errors.js";
import type { Redis } from "ioredis";
import { invalidateGroupCache } from "../../middleware/tenantContext.js";
import { recordAudit } from "../../lib/audit.js";
import { sendInviteEmail, getAppBaseUrl } from "../../lib/email.js";

const inviteSchema = z.object({
  email: z.string().min(3).regex(/^[^\s@]+@[^\s@]+$/, "Invalid email"),
  name: z.string().min(1).max(200),
  role: z.enum(["admin", "member", "viewer"]),
  groupIds: z.array(z.string().uuid()).min(0),
});

const changeRoleSchema = z.object({
  role: z.enum(["admin", "member", "viewer"]),
});

function sanitizeUser(user: typeof users.$inferSelect) {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

export function createIdentityRouter(
  db: Db,
  redis: Redis,
  ses: SESClient,
  env: ApiEnv,
): Router {
  const router = Router();

  // GET /users/me — current user profile
  router.get("/users/me", async (req, res) => {
    const { orgId, userId } = req.tenant;
    const rows = await db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.orgId, orgId)));
    if (!rows.length) throw new NotFoundError("User");
    res.json({ data: sanitizeUser(rows[0]!) });
  });

  // GET /users — list org users (directory for permission assignment, etc.)
  router.get("/users", async (req, res) => {
    const { orgId } = req.tenant;
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.orgId, orgId));
    res.json({ data: rows.map(sanitizeUser) });
  });

  // GET /users/invites — pending invitations (admin only)
  router.get("/users/invites", async (req, res) => {
    if (req.tenant.userRole !== "admin") throw new ForbiddenError();

    const { orgId } = req.tenant;
    const rows = await db
      .select({
        userId: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        invitedAt: users.createdAt,
        token: inviteTokens.token,
        expiresAt: inviteTokens.expiresAt,
      })
      .from(users)
      .innerJoin(
        inviteTokens,
        and(
          eq(inviteTokens.userId, users.id),
          isNull(inviteTokens.usedAt),
          gt(inviteTokens.expiresAt, new Date()),
        ),
      )
      .where(and(eq(users.orgId, orgId), eq(users.status, "invited")));

    res.json({
      data: rows.map((row) => ({
        userId: row.userId,
        email: row.email,
        name: row.name,
        role: row.role,
        invitedAt: row.invitedAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        inviteUrl: `${getAppBaseUrl()}/invite/${row.token}`,
      })),
    });
  });

  // POST /users/invite
  router.post("/users/invite", async (req, res) => {
    if (req.tenant.userRole !== "admin") throw new ForbiddenError();

    const body = inviteSchema.safeParse(req.body);
    if (!body.success) throw new ValidationError(body.error.flatten());

    const { orgId } = req.tenant;
    const { email, name, role, groupIds } = body.data;

    const existing = await db
      .select()
      .from(users)
      .where(and(eq(users.orgId, orgId), eq(users.email, email)));
    if (existing.length) throw new ConflictError("User already exists");

    const orgRows = await db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    const orgName = orgRows[0]?.name ?? "your organization";

    const userId = uuidv4();
    await db.insert(users).values({
      id: userId,
      orgId,
      email,
      name,
      role,
      status: "invited",
    });

    if (groupIds.length) {
      await db.insert(groupMemberships).values(
        groupIds.map((groupId) => ({ userId, groupId })),
      );
    }

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.insert(inviteTokens).values({ orgId, userId, token, expiresAt });

    await sendInviteEmail(ses, {
      fromAddress: env.SES_FROM_ADDRESS,
      toEmail: email,
      userName: name,
      orgName,
      inviteToken: token,
    });

    await recordAudit(db, {
      orgId,
      actorId: req.tenant.userId,
      action: "user.invite",
      target: { userId, email, role },
      req,
    });

    res.status(201).json({
      data: {
        userId,
        inviteToken: token,
        inviteUrl: `${getAppBaseUrl()}/invite/${token}`,
      },
    });
  });

  // POST /users/:userId/resend-invite
  router.post("/users/:userId/resend-invite", async (req, res) => {
    if (req.tenant.userRole !== "admin") throw new ForbiddenError();

    const { orgId } = req.tenant;
    const { userId } = req.params;

    const userRows = await db
      .select()
      .from(users)
      .where(and(eq(users.id, userId ?? ""), eq(users.orgId, orgId)));
    if (!userRows.length) throw new NotFoundError("User");
    const user = userRows[0]!;
    if (user.status !== "invited") {
      throw new ConflictError("User is not pending invitation");
    }

    await db
      .update(inviteTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(inviteTokens.userId, userId ?? ""),
          isNull(inviteTokens.usedAt),
        ),
      );

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.insert(inviteTokens).values({ orgId, userId: userId ?? "", token, expiresAt });

    const orgRows = await db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, orgId));

    await sendInviteEmail(ses, {
      fromAddress: env.SES_FROM_ADDRESS,
      toEmail: user.email,
      userName: user.name,
      orgName: orgRows[0]?.name ?? "your organization",
      inviteToken: token,
    });

    res.json({
      data: {
        inviteToken: token,
        inviteUrl: `${getAppBaseUrl()}/invite/${token}`,
      },
    });
  });

  // PATCH /users/:userId/role
  router.patch("/users/:userId/role", async (req, res) => {
    if (req.tenant.userRole !== "admin") throw new ForbiddenError();

    const body = changeRoleSchema.safeParse(req.body);
    if (!body.success) throw new ValidationError(body.error.flatten());

    const { orgId, userId: actorId } = req.tenant;
    const { userId } = req.params;

    if (userId === actorId && body.data.role !== "admin") {
      const admins = await db
        .select()
        .from(users)
        .where(and(eq(users.orgId, orgId), eq(users.role, "admin")));
      if (admins.length <= 1) throw new ForbiddenError("Cannot remove the last admin");
    }

    const updated = await db
      .update(users)
      .set({ role: body.data.role })
      .where(and(eq(users.id, userId ?? ""), eq(users.orgId, orgId)))
      .returning();

    if (!updated.length) throw new NotFoundError("User");

    await recordAudit(db, {
      orgId,
      actorId: actorId,
      action: "user.role_change",
      target: { userId, role: body.data.role },
      req,
    });

    res.json({ data: sanitizeUser(updated[0]!) });
  });

  // DELETE /users/:userId — deactivate
  router.delete("/users/:userId", async (req, res) => {
    if (req.tenant.userRole !== "admin") throw new ForbiddenError();

    const { orgId } = req.tenant;
    const { userId } = req.params;

    const target = await db
      .select()
      .from(users)
      .where(and(eq(users.id, userId ?? ""), eq(users.orgId, orgId)));
    if (!target.length) throw new NotFoundError("User");

    if (target[0]?.role === "admin") {
      const admins = await db
        .select()
        .from(users)
        .where(and(eq(users.orgId, orgId), eq(users.role, "admin")));
      if (admins.length <= 1) throw new ForbiddenError("Cannot remove the last admin");
    }

    await db
      .update(users)
      .set({ status: "deactivated" })
      .where(and(eq(users.id, userId ?? ""), eq(users.orgId, orgId)));

    await invalidateGroupCache(redis, orgId, userId ?? "");

    await recordAudit(db, {
      orgId,
      actorId: req.tenant.userId,
      action: "user.deactivate",
      target: { userId },
      req,
    });

    res.json({ data: { deactivated: true } });
  });

  return router;
}
