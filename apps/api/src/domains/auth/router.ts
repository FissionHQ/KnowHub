import { Router } from "express";
import { z } from "zod";
import * as jose from "jose";
import { eq, and, isNull, gt } from "drizzle-orm";
import type { Db } from "@wiki/db";
import { users, organizations, inviteTokens } from "@wiki/db";
import type { ApiEnv } from "@wiki/config";
import type { SESClient } from "@aws-sdk/client-ses";
import {
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
} from "../../lib/errors.js";
import { hashPassword, verifyPassword, validatePasswordPolicy } from "../../lib/password.js";
import { issueAccessToken } from "../../lib/jwt.js";
import { recordAudit } from "../../lib/audit.js";
import { resolveOrgByHost } from "../../lib/resolveOrgByHost.js";

const TOKEN_COOKIE = "wiki_token";
const TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const loginSchema = z.object({
  email: z.string().min(3).regex(/^[^\s@]+@[^\s@]+$/, "Invalid email"),
  password: z.string().min(1),
  orgSlug: z.string().min(1).optional(),
});

const acceptInviteSchema = z.object({
  token: z.string().uuid(),
  password: z.string().min(8),
  name: z.string().min(1).max(200).optional(),
});

function setTokenCookie(res: import("express").Response, token: string): void {
  res.cookie(TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "lax",
    maxAge: TOKEN_MAX_AGE_MS,
    path: "/",
  });
}

function clearTokenCookie(res: import("express").Response): void {
  res.clearCookie(TOKEN_COOKIE, { path: "/" });
}

function sanitizeUser(user: typeof users.$inferSelect) {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

async function resolveOrgBySlug(db: Db, orgSlug: string) {
  const rows = await db
    .select()
    .from(organizations)
    .where(eq(organizations.subdomain, orgSlug));
  if (!rows.length) throw new NotFoundError("Organization");
  return rows[0]!;
}

export function createAuthRouter(db: Db, env: ApiEnv, _ses: SESClient): Router {
  const router = Router();

  // POST /auth/login
  router.post("/login", async (req, res) => {
    const body = loginSchema.safeParse(req.body);
    if (!body.success) throw new ValidationError(body.error.flatten());

    const host = req.headers.host ?? "";
    const resolved = await resolveOrgByHost(db, host, env.BASE_DOMAIN);
    const orgSlug: string =
      body.data.orgSlug ??
      resolved?.subdomain ??
      (env.BASE_DOMAIN !== "localhost" ? (host.split(".")[0] ?? "acme") : "acme");

    const org = await resolveOrgBySlug(db, orgSlug);
    if (org.status === "suspended") {
      throw new ForbiddenError("Organization is suspended");
    }
    const rows = await db
      .select()
      .from(users)
      .where(and(eq(users.orgId, org.id), eq(users.email, body.data.email)));
    if (!rows.length) throw new UnauthorizedError("Invalid email or password");

    const user = rows[0]!;
    if (user.status === "deactivated") {
      throw new ForbiddenError("Account is deactivated");
    }
    if (user.status === "invited") {
      throw new ForbiddenError("Please accept your invitation before signing in");
    }
    if (!user.passwordHash || !verifyPassword(body.data.password, user.passwordHash)) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const token = await issueAccessToken({
      userId: user.id,
      orgId: org.id,
      orgSlug: org.subdomain,
      role: user.role,
      secret: env.JWT_SECRET,
    });

    setTokenCookie(res, token);

    await recordAudit(db, {
      orgId: org.id,
      actorId: user.id,
      action: "auth.login",
      target: { email: user.email },
      req,
    });

    res.json({ data: { token, user: sanitizeUser(user) } });
  });

  // POST /auth/logout
  router.post("/logout", async (req, res) => {
    clearTokenCookie(res);

    const authHeader = req.headers.authorization;
    const token =
      (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined) ??
      req.cookies?.[TOKEN_COOKIE];

    if (token && env.JWT_SECRET) {
      try {
        const secret = new TextEncoder().encode(env.JWT_SECRET);
        const { payload } = await jose.jwtVerify(token, secret);
        const orgId = payload["custom:org_id"] as string | undefined;
        const userId = payload.sub;
        if (orgId && userId) {
          await recordAudit(db, {
            orgId,
            actorId: userId,
            action: "auth.logout",
            req,
          });
        }
      } catch {
        // ignore invalid token on logout
      }
    }

    res.json({ data: { loggedOut: true } });
  });

  // GET /auth/invite/:token
  router.get("/invite/:token", async (req, res) => {
    const { token } = req.params;
    const rows = await db
      .select({
        token: inviteTokens.token,
        expiresAt: inviteTokens.expiresAt,
        usedAt: inviteTokens.usedAt,
        userId: users.id,
        userName: users.name,
        userEmail: users.email,
        userStatus: users.status,
        orgId: organizations.id,
        orgName: organizations.name,
        orgSlug: organizations.subdomain,
      })
      .from(inviteTokens)
      .innerJoin(users, eq(inviteTokens.userId, users.id))
      .innerJoin(organizations, eq(inviteTokens.orgId, organizations.id))
      .where(eq(inviteTokens.token, token ?? ""));

    if (!rows.length) throw new NotFoundError("Invitation");
    const invite = rows[0]!;

    if (invite.usedAt) throw new ForbiddenError("Invitation has already been used");
    if (invite.expiresAt < new Date()) throw new ForbiddenError("Invitation has expired");
    if (invite.userStatus === "deactivated") {
      throw new ForbiddenError("This account has been deactivated");
    }

    res.json({
      data: {
        token: invite.token,
        expiresAt: invite.expiresAt.toISOString(),
        user: {
          id: invite.userId,
          name: invite.userName,
          email: invite.userEmail,
        },
        organization: {
          id: invite.orgId,
          name: invite.orgName,
          subdomain: invite.orgSlug,
        },
      },
    });
  });

  // POST /auth/accept-invite
  router.post("/accept-invite", async (req, res) => {
    const body = acceptInviteSchema.safeParse(req.body);
    if (!body.success) throw new ValidationError(body.error.flatten());

    const policyError = validatePasswordPolicy(body.data.password);
    if (policyError) throw new ValidationError({ password: [policyError] });

    const rows = await db
      .select({
        inviteId: inviteTokens.id,
        expiresAt: inviteTokens.expiresAt,
        usedAt: inviteTokens.usedAt,
        orgId: inviteTokens.orgId,
        userId: inviteTokens.userId,
        orgSlug: organizations.subdomain,
        orgName: organizations.name,
        userEmail: users.email,
        userName: users.name,
        userRole: users.role,
        userStatus: users.status,
      })
      .from(inviteTokens)
      .innerJoin(users, eq(inviteTokens.userId, users.id))
      .innerJoin(organizations, eq(inviteTokens.orgId, organizations.id))
      .where(
        and(
          eq(inviteTokens.token, body.data.token),
          isNull(inviteTokens.usedAt),
          gt(inviteTokens.expiresAt, new Date()),
        ),
      );

    if (!rows.length) throw new NotFoundError("Invitation");
    const invite = rows[0]!;
    if (invite.userStatus === "deactivated") {
      throw new ForbiddenError("This account has been deactivated");
    }

    const passwordHash = hashPassword(body.data.password);
    const updated = await db
      .update(users)
      .set({
        status: "active",
        passwordHash,
        ...(body.data.name ? { name: body.data.name } : {}),
      })
      .where(eq(users.id, invite.userId))
      .returning();

    await db
      .update(inviteTokens)
      .set({ usedAt: new Date() })
      .where(eq(inviteTokens.id, invite.inviteId));

    const user = updated[0]!;
    const token = await issueAccessToken({
      userId: user.id,
      orgId: invite.orgId,
      orgSlug: invite.orgSlug,
      role: user.role,
      secret: env.JWT_SECRET,
    });

    setTokenCookie(res, token);

    await recordAudit(db, {
      orgId: invite.orgId,
      actorId: user.id,
      action: "user.activate",
      target: { userId: user.id, email: user.email },
      req,
    });

    res.json({ data: { token, user: sanitizeUser(user) } });
  });

  return router;
}

export { TOKEN_COOKIE };
