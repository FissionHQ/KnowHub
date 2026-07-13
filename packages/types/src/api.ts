import type { AccessLevel, DocumentStatus, DocumentType, UserRole } from "./enums.js";
import type { Document } from "./entities.js";

export interface ApiSuccess<T> {
  data: T;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─── Auth ──────────────────────────────────────────────────────────────────

// ─── Auth ──────────────────────────────────────────────────────────────────

export interface LoginBody {
  email: string;
  password: string;
  orgSlug?: string;
}

export interface AcceptInviteBody {
  token: string;
  password: string;
  name?: string;
}

export interface LoginResponse {
  token: string;
  user: import("./entities.js").User;
}

export interface InviteDetails {
  token: string;
  expiresAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  organization: {
    id: string;
    name: string;
    subdomain: string;
  };
}

export interface PendingInvite {
  userId: string;
  email: string;
  name: string;
  role: import("./enums.js").UserRole;
  invitedAt: string;
  expiresAt: string;
  inviteUrl: string;
}

export interface AuthTokenPayload {
  sub: string;
  email: string;
  "custom:org_id": string;
  "custom:org_slug": string;
  "custom:role": UserRole;
  iat: number;
  exp: number;
}

export interface TenantContext {
  orgId: string;
  orgSlug: string;
  userId: string;
  userRole: UserRole;
  groupIds: string[];
}

// ─── Spaces ────────────────────────────────────────────────────────────────

export interface CreateSpaceBody {
  name: string;
  description?: string;
  iconEmoji?: string;
  groupPermissions: Array<{ groupId: string; accessLevel: AccessLevel }>;
}

export interface UpdateSpaceBody {
  name?: string;
  description?: string;
  iconEmoji?: string;
}

// ─── Documents ────────────────────────────────────────────────────────────

export interface CreateDocumentBody {
  spaceId: string;
  parentId?: string;
  type: DocumentType;
  title: string;
  content?: string;
  tags?: string[];
}

export interface UpdateDocumentBody {
  title?: string;
  content?: string;
  tags?: string[];
  status?: DocumentStatus;
}

export interface DocumentListItem extends Document {
  canDelete: boolean;
  canEdit: boolean;
  ownerName: string;
  ownerEmail: string;
  attachmentScanStatus: string | null;
  fileSizeBytes: number | null;
  fileType: string | null;
}

export interface SetDocumentPermissionBody {
  groupId?: string;
  userId?: string;
  accessLevel: AccessLevel;
}

export interface DocumentPermissionRecord {
  id: string;
  documentId: string;
  groupId?: string;
  userId?: string;
  accessLevel: AccessLevel;
  groupName?: string;
  userName?: string;
  userEmail?: string;
}

export interface SpacePermissionRecord {
  groupId: string;
  groupName: string;
  accessLevel: AccessLevel;
}

export interface DocumentPermissionsResponse {
  overrides: DocumentPermissionRecord[];
  inherited: SpacePermissionRecord[];
}

// ─── Users ────────────────────────────────────────────────────────────────

export interface InviteUserBody {
  email: string;
  name: string;
  role: UserRole;
  groupIds: string[];
}

export interface ChangeRoleBody {
  role: UserRole;
}

// ─── Groups ───────────────────────────────────────────────────────────────

export interface CreateGroupBody {
  name: string;
  description?: string;
}

export interface AddGroupMembersBody {
  userIds: string[];
}

export interface GroupMembershipEntry {
  groupId: string;
  userId: string;
  userName: string;
  userEmail: string;
  userStatus: import("./enums.js").UserStatus;
}

export interface SetUserGroupsBody {
  groupIds: string[];
}

// ─── Admin ────────────────────────────────────────────────────────────────

export interface UpdateOrgSettingsBody {
  name?: string;
  branding?: {
    logoUrl?: string;
    primaryColor?: string;
  };
  maxFileSizeBytes?: number;
  trashRetentionDays?: number;
}

export interface AuditLogQuery {
  limit?: number;
  offset?: number;
}

// ─── Search ───────────────────────────────────────────────────────────────

export interface SearchQuery {
  q: string;
  spaceId?: string;
  type?: DocumentType;
  authorId?: string;
  tags?: string[];
  from?: string;
  to?: string;
  page?: number;
  size?: number;
}

export interface SearchHit {
  documentId: string;
  spaceId: string;
  type: DocumentType;
  title: string;
  highlight: {
    title?: string[];
    body?: string[];
  };
  score: number;
  updatedAt: string;
}

export interface SearchResponse {
  hits: SearchHit[];
  total: number;
  page: number;
  size: number;
}

// ─── Upload ───────────────────────────────────────────────────────────────

export interface UploadInitResponse {
  attachmentId: string;
  status: "pending";
}

export interface AttachmentStatusResponse {
  attachmentId: string;
  scanStatus: string;
  ready: boolean;
  s3Key?: string;
}

export interface AttachmentListItem {
  id: string;
  documentId: string;
  originalName: string;
  fileType: string;
  sizeBytes: number;
  scanStatus: string;
  s3Key?: string;
  createdAt: string;
}

// ─── Platform / Tenant ────────────────────────────────────────────────────

export interface ProvisionOrgBody {
  subdomain: string;
  name: string;
  adminEmail: string;
  adminName: string;
  adminPassword: string;
  branding?: { logoUrl?: string; primaryColor?: string };
}

export interface ProvisionOrgResponse {
  orgId: string;
  subdomain: string;
  adminUserId: string;
  defaultGroupId: string;
  loginUrl: string;
}

export interface PlatformOrgSummary {
  id: string;
  subdomain: string;
  name: string;
  status: string;
  branding: Record<string, unknown>;
  createdAt: string;
  loginUrl: string;
  domains: Array<{ id: string; domain: string; isPrimary: boolean }>;
}

export interface TenantResolveResponse {
  resolved: boolean;
  devMode?: boolean;
  defaultSlug?: string;
  orgId?: string;
  slug?: string;
  name?: string;
  branding?: Record<string, unknown>;
  status?: string;
}

export interface DocxImportResponse {
  document: import("./entities.js").Document;
  warnings: string[];
}

export interface PdfUploadResponse {
  documentId: string;
  attachmentId: string;
  status: string;
}
