import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { SignJWT } from "jose";
import postgres from "postgres";
import { randomBytes, scryptSync } from "node:crypto";
import { writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  documentVersions,
  documents,
  groupMemberships,
  groups,
  organizations,
  spacePermissions,
  spaces,
  users,
} from "./schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

config({ path: path.resolve(__dirname, "../../../.env") });

const IDS = {
  org: "11111111-1111-1111-1111-111111111111",
  admin: "22222222-2222-2222-2222-222222222222",
  member: "44444444-4444-4444-4444-444444444444",
  group: "33333333-3333-3333-3333-333333333333",
  spaces: {
    engineering: "55555555-5555-5555-5555-555555555501",
    product: "55555555-5555-5555-5555-555555555502",
    hr: "55555555-5555-5555-5555-555555555503",
  },
  docs: {
    welcome: "66666666-6666-6666-6666-666666666601",
    architecture: "66666666-6666-6666-6666-666666666602",
    roadmap: "66666666-6666-6666-6666-666666666603",
    onboarding: "66666666-6666-6666-6666-666666666604",
    handbook: "66666666-6666-6666-6666-666666666605",
  },
} as const;

const DEV_PASSWORD = "password123";

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

async function main() {
  const url = process.env["DATABASE_URL"];
  const jwtSecret = process.env["JWT_SECRET"];
  if (!url) throw new Error("DATABASE_URL is required");
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters");
  }

  const pg = postgres(url, { max: 1 });
  const db = drizzle(pg);

  console.log("Clearing existing dev org (if any)...");
  await db.delete(organizations).where(eq(organizations.id, IDS.org));

  console.log("Inserting organization and users...");
  await db.insert(organizations).values({
    id: IDS.org,
    subdomain: "acme",
    name: "Acme Corp",
  });

  await db.insert(users).values([
    {
      id: IDS.admin,
      orgId: IDS.org,
      email: "admin@localhost",
      name: "Dev Admin",
      role: "admin",
      status: "active",
      passwordHash: hashPassword(DEV_PASSWORD),
    },
    {
      id: IDS.member,
      orgId: IDS.org,
      email: "member@localhost",
      name: "Test Member",
      role: "member",
      status: "active",
      passwordHash: hashPassword(DEV_PASSWORD),
    },
  ]);

  await db.insert(groups).values({
    id: IDS.group,
    orgId: IDS.org,
    name: "Everyone",
    description: "Default group for all users",
    isDefault: true,
  });

  await db.insert(groupMemberships).values([
    { userId: IDS.admin, groupId: IDS.group },
    { userId: IDS.member, groupId: IDS.group },
  ]);

  console.log("Inserting spaces...");
  await db.insert(spaces).values([
    {
      id: IDS.spaces.engineering,
      orgId: IDS.org,
      name: "Engineering",
      description: "Technical docs, architecture, and runbooks",
      iconEmoji: "⚙️",
      createdBy: IDS.admin,
    },
    {
      id: IDS.spaces.product,
      orgId: IDS.org,
      name: "Product",
      description: "Roadmaps, specs, and release notes",
      iconEmoji: "🚀",
      createdBy: IDS.admin,
    },
    {
      id: IDS.spaces.hr,
      orgId: IDS.org,
      name: "People & HR",
      description: "Onboarding, policies, and team handbook",
      iconEmoji: "👥",
      createdBy: IDS.admin,
    },
  ]);

  await db.insert(spacePermissions).values([
    { spaceId: IDS.spaces.engineering, groupId: IDS.group, accessLevel: "edit" },
    { spaceId: IDS.spaces.product, groupId: IDS.group, accessLevel: "edit" },
    { spaceId: IDS.spaces.hr, groupId: IDS.group, accessLevel: "view" },
  ]);

  console.log("Inserting documents...");
  const docRows = [
    {
      id: IDS.docs.welcome,
      spaceId: IDS.spaces.engineering,
      title: "Welcome to FissionDocs",
      content:
        "<h2>Welcome</h2><p>This is sample engineering documentation for local development.</p><ul><li>Architecture overview</li><li>Deployment guide</li><li>On-call runbooks</li></ul>",
      tags: ["welcome", "demo"],
    },
    {
      id: IDS.docs.architecture,
      spaceId: IDS.spaces.engineering,
      title: "System Architecture",
      content:
        "<h2>Architecture</h2><p>The platform uses Next.js, Express, Postgres, OpenSearch, and SQS workers.</p><blockquote>Monorepo managed with Turborepo and pnpm.</blockquote>",
      tags: ["architecture"],
    },
    {
      id: IDS.docs.roadmap,
      spaceId: IDS.spaces.product,
      title: "Q3 Product Roadmap",
      content:
        "<h2>Q3 Goals</h2><ol><li>Launch search improvements</li><li>PDF annotation support</li><li>Admin dashboard</li></ol>",
      tags: ["roadmap", "planning"],
    },
    {
      id: IDS.docs.onboarding,
      spaceId: IDS.spaces.hr,
      title: "New Hire Onboarding",
      content:
        "<h2>Week 1 Checklist</h2><p>Meet your team, set up local dev, and read the handbook.</p>",
      tags: ["onboarding"],
    },
    {
      id: IDS.docs.handbook,
      spaceId: IDS.spaces.hr,
      title: "Employee Handbook",
      content:
        "<h2>Company Policies</h2><p>Remote work, time off, and code of conduct guidelines.</p>",
      tags: ["policies"],
    },
  ] as const;

  for (const doc of docRows) {
    await db.insert(documents).values({
      id: doc.id,
      orgId: IDS.org,
      spaceId: doc.spaceId,
      type: "page",
      title: doc.title,
      contentRef: doc.content,
      ownerId: IDS.admin,
      status: "published",
      version: 1,
      tags: [...doc.tags],
    });

    await db.insert(documentVersions).values({
      documentId: doc.id,
      versionNumber: 1,
      contentSnapshot: doc.content,
      editedBy: IDS.admin,
    });
  }

  const token = await new SignJWT({
    "custom:org_id": IDS.org,
    "custom:org_slug": "acme",
    "custom:role": "admin",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(IDS.admin)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(new TextEncoder().encode(jwtSecret));

  const envLocalPath = path.resolve(__dirname, "../../../apps/web/.env.local");
  writeFileSync(envLocalPath, `NEXT_PUBLIC_DEV_JWT=${token}\n`);

  console.log("\nSeed complete!\n");
  console.log("Organization: Acme Corp (subdomain: acme)");
  console.log("Admin user:   admin@localhost");
  console.log("Member user:  member@localhost");
  console.log(`Dev password: ${DEV_PASSWORD} (both users)`);
  console.log("Spaces:       Engineering, Product, People & HR");
  console.log("Documents:    5 sample pages");
  console.log(`Dev JWT:        written to apps/web/.env.local (legacy fallback)`);
  console.log("\nSign in at http://localhost:3000/login");

  await pg.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
