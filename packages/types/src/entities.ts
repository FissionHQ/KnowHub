import type {
  AccessLevel,
  AuditAction,
  DocumentStatus,
  DocumentType,
  ScanStatus,
  UserRole,
  UserStatus,
} from "./enums.js";

export interface Organization {
  id: string;
  subdomain: string;
  name: string;
  branding: OrgBranding;
  maxFileSizeBytes: number;
  trashRetentionDays: number;
  auditRetentionDays: number;
  createdAt: Date;
}

export interface OrgBranding {
  logoUrl?: string;
  primaryColor?: string;
}

export interface User {
  id: string;
  orgId: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  cognitoSub?: string;
  createdAt: Date;
}

export interface Group {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  isDefault: boolean;
  createdAt: Date;
}

export interface GroupMembership {
  userId: string;
  groupId: string;
}

export interface Space {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  iconEmoji?: string;
  createdBy: string;
  createdAt: Date;
}

export interface SpacePermission {
  spaceId: string;
  groupId: string;
  accessLevel: AccessLevel;
}

export interface Document {
  id: string;
  orgId: string;
  spaceId: string;
  parentId?: string;
  type: DocumentType;
  title: string;
  contentRef?: string;
  ownerId: string;
  ownerName?: string;
  lastEditedByName?: string;
  status: DocumentStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
  restrictDownload: boolean;
  trashedAt?: Date;
  /** Present on GET /documents/:id — effective access for the current user */
  accessLevel?: AccessLevel;
}

export interface TrashedDocument {
  id: string;
  title: string;
  type: DocumentType;
  spaceId: string;
  spaceName: string;
  ownerId: string;
  trashedAt: Date;
  purgeAt: Date;
  /** Status before trash (draft or published) */
  previousStatus: "draft" | "published";
}

export interface DocumentPermission {
  id: string;
  documentId: string;
  groupId?: string;
  userId?: string;
  accessLevel: AccessLevel;
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  contentSnapshot: string;
  editedBy: string;
  editedByName?: string;
  editedAt: Date;
}

export interface Comment {
  id: string;
  documentId: string;
  parentId?: string;
  authorId: string;
  authorName: string;
  body: string;
  resolved: boolean;
  createdAt: Date;
  updatedAt: Date;
  replies?: Comment[];
}

export interface DocumentVersionListItem extends DocumentVersion {
  editorName: string | null;
}

export interface Attachment {
  id: string;
  orgId: string;
  documentId: string;
  originalName: string;
  s3Key?: string;
  quarantineKey: string;
  fileType: string;
  sizeBytes: number;
  scanStatus: ScanStatus;
  createdAt: Date;
}

export interface AuditLogEntry {
  id: string;
  orgId: string;
  actorId: string;
  action: AuditAction;
  target: Record<string, unknown>;
  ipAddress?: string;
  timestamp: Date;
}
