import * as jose from "jose";
import type { UserRole } from "@wiki/types";

export async function issueAccessToken(opts: {
  userId: string;
  orgId: string;
  orgSlug: string;
  role: UserRole;
  secret: string;
  expiresIn?: string;
}): Promise<string> {
  return new jose.SignJWT({
    "custom:org_id": opts.orgId,
    "custom:org_slug": opts.orgSlug,
    "custom:role": opts.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(opts.userId)
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? "30d")
    .sign(new TextEncoder().encode(opts.secret));
}
