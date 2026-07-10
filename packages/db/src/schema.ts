import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", ["admin", "member", "viewer"]);
export const userStatusEnum = pgEnum("user_status", ["active", "invited", "deactivated"]);
export const accessLevelEnum = pgEnum("access_level", ["view", "edit"]);
export const documentTypeEnum = pgEnum("document_type", ["page", "pdf"]);
export const documentStatusEnum = pgEnum("document_status", ["draft", "published", "trashed"]);
export const scanStatusEnum = pgEnum("scan_status", [
  "pending",
  "scanning",
  "clean",
  "infected",
  "error",
]);

// ─── Organizations ────────────────────────────────────────────────────────

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  subdomain: text("subdomain").notNull().unique(),
  name: text("name").notNull(),
  branding: jsonb("branding").notNull().default({}),
  maxFileSizeBytes: bigint("max_file_size_bytes", { mode: "number" })
    .notNull()
    .default(104_857_600), // 100 MB
  trashRetentionDays: integer("trash_retention_days").notNull().default(30),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Users ────────────────────────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: userRoleEnum("role").notNull().default("member"),
    status: userStatusEnum("status").notNull().default("invited"),
    cognitoSub: text("cognito_sub").unique(),
    passwordHash: text("password_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("users_org_email_unique").on(t.orgId, t.email),
    index("users_org_id_idx").on(t.orgId),
  ],
);

// ─── Groups ───────────────────────────────────────────────────────────────

export const groups = pgTable(
  "groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("groups_org_name_unique").on(t.orgId, t.name),
    index("groups_org_id_idx").on(t.orgId),
  ],
);

export const groupMemberships = pgTable(
  "group_memberships",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.groupId] }),
    index("group_memberships_group_id_idx").on(t.groupId),
  ],
);

// ─── Spaces ───────────────────────────────────────────────────────────────

export const spaces = pgTable(
  "spaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    iconEmoji: text("icon_emoji"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("spaces_org_id_idx").on(t.orgId)],
);

export const spacePermissions = pgTable(
  "space_permissions",
  {
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    accessLevel: accessLevelEnum("access_level").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.spaceId, t.groupId] }),
    index("space_permissions_group_id_idx").on(t.groupId),
  ],
);

// ─── Documents ────────────────────────────────────────────────────────────

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    type: documentTypeEnum("type").notNull().default("page"),
    title: text("title").notNull(),
    contentRef: text("content_ref"),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    status: documentStatusEnum("status").notNull().default("draft"),
    version: integer("version").notNull().default(1),
    tags: text("tags").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("documents_org_id_idx").on(t.orgId),
    index("documents_space_id_idx").on(t.spaceId),
    index("documents_parent_id_idx").on(t.parentId),
    index("documents_owner_id_idx").on(t.ownerId),
    index("documents_status_idx").on(t.status),
  ],
);

export const documentPermissions = pgTable(
  "document_permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").references(() => groups.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    accessLevel: accessLevelEnum("access_level").notNull(),
  },
  (t) => [index("doc_permissions_document_id_idx").on(t.documentId)],
);

export const documentVersions = pgTable(
  "document_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    contentSnapshot: text("content_snapshot").notNull(),
    editedBy: uuid("edited_by")
      .notNull()
      .references(() => users.id),
    editedAt: timestamp("edited_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("doc_versions_unique").on(t.documentId, t.versionNumber),
    index("doc_versions_document_id_idx").on(t.documentId),
  ],
);

// ─── Attachments ──────────────────────────────────────────────────────────

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    originalName: text("original_name").notNull(),
    quarantineKey: text("quarantine_key").notNull(),
    s3Key: text("s3_key"),
    fileType: text("file_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    scanStatus: scanStatusEnum("scan_status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("attachments_org_id_idx").on(t.orgId),
    index("attachments_document_id_idx").on(t.documentId),
    index("attachments_scan_status_idx").on(t.scanStatus),
  ],
);

// ─── Document Comments ───────────────────────────────────────────────────

export const documentComments = pgTable(
  "document_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    resolved: boolean("resolved").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("doc_comments_document_id_idx").on(t.documentId),
    index("doc_comments_parent_id_idx").on(t.parentId),
  ],
);

// ─── Audit Log ────────────────────────────────────────────────────────────

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    target: jsonb("target").notNull().default({}),
    ipAddress: text("ip_address"),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_org_id_idx").on(t.orgId),
    index("audit_log_timestamp_idx").on(t.timestamp),
    index("audit_log_actor_id_idx").on(t.actorId),
  ],
);

// ─── Invite Tokens ────────────────────────────────────────────────────────

export const inviteTokens = pgTable(
  "invite_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (t) => [index("invite_tokens_token_idx").on(t.token)],
);
