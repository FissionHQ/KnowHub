import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";
import type { Db } from "@wiki/db";
import { organizations, groups, users, groupMemberships } from "@wiki/db";
import { hashPassword } from "./password.js";

export interface ProvisionOrgInput {
  subdomain: string;
  name: string;
  adminEmail: string;
  adminName: string;
  adminPassword: string;
  branding?: { logoUrl?: string | undefined; primaryColor?: string | undefined };
}

export interface ProvisionOrgResult {
  orgId: string;
  subdomain: string;
  adminUserId: string;
  defaultGroupId: string;
}

export async function provisionOrg(db: Db, input: ProvisionOrgInput): Promise<ProvisionOrgResult> {
  const orgId = uuidv4();
  const adminUserId = uuidv4();
  const defaultGroupId = uuidv4();

  const existing = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.subdomain, input.subdomain));
  if (existing.length) {
    throw new Error(`Subdomain "${input.subdomain}" is already taken`);
  }

  await db.insert(organizations).values({
    id: orgId,
    subdomain: input.subdomain,
    name: input.name,
    branding: input.branding ?? {},
    status: "active",
  });

  await db.insert(groups).values({
    id: defaultGroupId,
    orgId,
    name: "All Members",
    description: "Default group for all organization members",
    isDefault: true,
  });

  await db.insert(users).values({
    id: adminUserId,
    orgId,
    email: input.adminEmail,
    name: input.adminName,
    role: "admin",
    status: "active",
    passwordHash: hashPassword(input.adminPassword),
  });

  await db.insert(groupMemberships).values({
    userId: adminUserId,
    groupId: defaultGroupId,
  });

  return { orgId, subdomain: input.subdomain, adminUserId, defaultGroupId };
}
