import type {
  Document,
  Space,
  Group,
  User,
  Organization,
  AuditLogEntry,
  SearchResponse,
  CreateDocumentBody,
  UpdateDocumentBody,
  CreateSpaceBody,
  InviteUserBody,
  UpdateOrgSettingsBody,
  AuditLogQuery,
  DocumentPermissionsResponse,
  DocumentPermissionRecord,
  SetDocumentPermissionBody,
  AccessLevel,
  LoginBody,
  LoginResponse,
  AcceptInviteBody,
  InviteDetails,
  PendingInvite,
  GroupMembershipEntry,
  PlatformOrgSummary,
  ProvisionOrgBody,
  ProvisionOrgResponse,
  TenantResolveResponse,
  DocxImportResponse,
  PdfUploadResponse,
  AttachmentListItem,
  DocumentListItem,
} from "@wiki/types";

const BASE = "/api";
const SEARCH_BASE = "/search";

function platformHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const key = sessionStorage.getItem("platform_admin_key");
  return key ? { "X-Platform-Key": key } : {};
}

function devAuthHeaders(): Record<string, string> {
  const token = process.env["NEXT_PUBLIC_DEV_JWT"];
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...devAuthHeaders(),
      ...init?.headers,
    },
    credentials: "include",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: "Unknown error" } }));
    throw new Error((err as { error?: { message?: string } }).error?.message ?? "Request failed");
  }

  const json = await res.json() as { data: T };
  return json.data;
}

// ─── Auth ─────────────────────────────────────────────────────────────────

export const authApi = {
  login: async (body: LoginBody): Promise<LoginResponse> => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: "Login failed" } }));
      throw new Error((err as { error?: { message?: string } }).error?.message ?? "Login failed");
    }
    const json = await res.json() as { data: LoginResponse };
    return json.data;
  },
  logout: async (): Promise<void> => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  },
  getInvite: (token: string) => apiFetch<InviteDetails>(`${BASE}/auth/invite/${token}`),
  acceptInvite: async (body: AcceptInviteBody): Promise<LoginResponse> => {
    const res = await fetch("/api/auth/accept-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: "Failed to accept invite" } }));
      throw new Error(
        (err as { error?: { message?: string } }).error?.message ?? "Failed to accept invite",
      );
    }
    const json = await res.json() as { data: LoginResponse };
    return json.data;
  },
};

// ─── Spaces ────────────────────────────────────────────────────────────────

export const spacesApi = {
  list: () => apiFetch<Space[]>(`${BASE}/spaces`),
  get: (id: string) => apiFetch<Space>(`${BASE}/spaces/${id}`),
  create: (body: CreateSpaceBody) =>
    apiFetch<Space>(`${BASE}/spaces`, { method: "POST", body: JSON.stringify(body) }),
  delete: (id: string) =>
    apiFetch<{ deleted: boolean }>(`${BASE}/spaces/${id}`, { method: "DELETE" }),
};

// ─── Documents ────────────────────────────────────────────────────────────

export const documentsApi = {
  listBySpace: (spaceId: string) =>
    apiFetch<DocumentListItem[]>(`${BASE}/spaces/${spaceId}/documents`),
  get: (id: string) => apiFetch<Document>(`${BASE}/documents/${id}`),
  create: (body: CreateDocumentBody) =>
    apiFetch<Document>(`${BASE}/documents`, { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: UpdateDocumentBody) =>
    apiFetch<Document>(`${BASE}/documents/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (id: string) =>
    apiFetch<{ trashed: boolean }>(`${BASE}/documents/${id}`, { method: "DELETE" }),
  getVersions: (id: string) =>
    apiFetch<{ id: string; versionNumber: number; editedAt: string }[]>(
      `${BASE}/documents/${id}/versions`,
    ),
  restoreVersion: (id: string, versionNumber: number) =>
    apiFetch<Document>(`${BASE}/documents/${id}/versions/${versionNumber}/restore`, {
      method: "POST",
    }),
  listPermissions: (id: string) =>
    apiFetch<DocumentPermissionsResponse>(`${BASE}/documents/${id}/permissions`),
  setPermission: (id: string, body: SetDocumentPermissionBody) =>
    apiFetch<DocumentPermissionRecord>(`${BASE}/documents/${id}/permissions`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updatePermission: (documentId: string, permissionId: string, accessLevel: AccessLevel) =>
    apiFetch<DocumentPermissionRecord>(
      `${BASE}/documents/${documentId}/permissions/${permissionId}`,
      { method: "PATCH", body: JSON.stringify({ accessLevel }) },
    ),
  deletePermission: (documentId: string, permissionId: string) =>
    apiFetch<{ deleted: boolean }>(
      `${BASE}/documents/${documentId}/permissions/${permissionId}`,
      { method: "DELETE" },
    ),
};

// ─── Attachments ──────────────────────────────────────────────────────────

export const attachmentsApi = {
  upload: async (documentId: string, file: File): Promise<{ attachmentId: string }> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/documents/${documentId}/attachments`, {
      method: "POST",
      body: form,
      headers: devAuthHeaders(),
      credentials: "include",
    });
    if (!res.ok) throw new Error("Upload failed");
    const json = await res.json() as { data: { attachmentId: string } };
    return json.data;
  },
  uploadPdf: async (spaceId: string, file: File, title?: string): Promise<PdfUploadResponse> => {
    const form = new FormData();
    form.append("file", file);
    if (title) form.append("title", title);
    const res = await fetch(`${BASE}/spaces/${spaceId}/upload/pdf`, {
      method: "POST",
      body: form,
      headers: devAuthHeaders(),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: "Upload failed" } }));
      throw new Error((err as { error?: { message?: string } }).error?.message ?? "Upload failed");
    }
    const json = await res.json() as { data: PdfUploadResponse };
    return json.data;
  },
  listByDocument: (documentId: string) =>
    apiFetch<AttachmentListItem[]>(`${BASE}/documents/${documentId}/attachments`),
  uploadImage: async (file: File): Promise<{ url: string }> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/upload/image`, {
      method: "POST",
      body: form,
      headers: devAuthHeaders(),
      credentials: "include",
    });
    if (!res.ok) throw new Error("Image upload failed");
    const json = await res.json() as { data: { url: string } };
    return json.data;
  },
  getStatus: (attachmentId: string) =>
    apiFetch<{ attachmentId: string; scanStatus: string; ready: boolean }>(
      `${BASE}/attachments/${attachmentId}/status`,
    ),
  getViewUrl: (attachmentId: string) =>
    apiFetch<{ url: string; expiresIn: number }>(
      `${BASE}/attachments/${attachmentId}/view`,
    ),
};

// ─── Groups ───────────────────────────────────────────────────────────────

export const groupsApi = {
  list: () => apiFetch<Group[]>(`${BASE}/groups`),
  listMemberships: () => apiFetch<GroupMembershipEntry[]>(`${BASE}/groups/memberships`),
  create: (body: { name: string; description?: string }) =>
    apiFetch<Group>(`${BASE}/groups`, { method: "POST", body: JSON.stringify(body) }),
  delete: (id: string) =>
    apiFetch<{ deleted: boolean }>(`${BASE}/groups/${id}`, { method: "DELETE" }),
  addMembers: (groupId: string, userIds: string[]) =>
    apiFetch<{ added: number }>(`${BASE}/groups/${groupId}/members`, {
      method: "POST",
      body: JSON.stringify({ userIds }),
    }),
  removeMember: (groupId: string, userId: string) =>
    apiFetch<{ removed: boolean }>(`${BASE}/groups/${groupId}/members/${userId}`, {
      method: "DELETE",
    }),
};

// ─── Users ────────────────────────────────────────────────────────────────

export const usersApi = {
  me: () => apiFetch<User>(`${BASE}/users/me`),
  list: () => apiFetch<User[]>(`${BASE}/users`),
  invite: (body: InviteUserBody) =>
    apiFetch<{ userId: string; inviteToken: string; inviteUrl: string }>(`${BASE}/users/invite`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listInvites: () => apiFetch<PendingInvite[]>(`${BASE}/users/invites`),
  resendInvite: (userId: string) =>
    apiFetch<{ inviteToken: string; inviteUrl: string }>(
      `${BASE}/users/${userId}/resend-invite`,
      { method: "POST" },
    ),
  changeRole: (userId: string, role: string) =>
    apiFetch<User>(`${BASE}/users/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),
  deactivate: (userId: string) =>
    apiFetch<{ deactivated: boolean }>(`${BASE}/users/${userId}`, { method: "DELETE" }),
};

// ─── Admin ────────────────────────────────────────────────────────────────

export const adminApi = {
  getSettings: () => apiFetch<Organization>(`${BASE}/admin/settings`),
  updateSettings: (body: UpdateOrgSettingsBody) =>
    apiFetch<Organization>(`${BASE}/admin/settings`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  getAuditLog: (params: AuditLogQuery = {}) => {
    const qs = new URLSearchParams();
    if (params.limit !== undefined) qs.set("limit", String(params.limit));
    if (params.offset !== undefined) qs.set("offset", String(params.offset));
    const query = qs.toString();
    return apiFetch<AuditLogEntry[]>(
      `${BASE}/admin/audit-log${query ? `?${query}` : ""}`,
    );
  },
};

// ─── Import ───────────────────────────────────────────────────────────────

export const importApi = {
  uploadDocx: async (spaceId: string, file: File, title?: string): Promise<DocxImportResponse> => {
    const form = new FormData();
    form.append("file", file);
    if (title) form.append("title", title);
    const res = await fetch(`${BASE}/spaces/${spaceId}/import/docx`, {
      method: "POST",
      body: form,
      headers: devAuthHeaders(),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: "Import failed" } }));
      throw new Error((err as { error?: { message?: string } }).error?.message ?? "Import failed");
    }
    const json = await res.json() as { data: DocxImportResponse };
    return json.data;
  },
};

// ─── Platform admin ───────────────────────────────────────────────────────

export const platformApi = {
  listOrgs: () =>
    apiFetch<PlatformOrgSummary[]>(`${BASE}/platform/organizations`, {
      headers: platformHeaders(),
    }),
  provisionOrg: (body: ProvisionOrgBody) =>
    apiFetch<ProvisionOrgResponse>(`${BASE}/platform/organizations`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: platformHeaders(),
    }),
  addDomain: (orgId: string, domain: string, isPrimary?: boolean) =>
    apiFetch<{ id: string; domain: string }>(`${BASE}/platform/organizations/${orgId}/domains`, {
      method: "POST",
      body: JSON.stringify({ domain, isPrimary }),
      headers: platformHeaders(),
    }),
  updateOrg: (orgId: string, body: { name?: string; status?: "active" | "suspended" }) =>
    apiFetch<Organization>(`${BASE}/platform/organizations/${orgId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: platformHeaders(),
    }),
};

// ─── Tenant ───────────────────────────────────────────────────────────────

export const tenantApi = {
  resolve: () => apiFetch<TenantResolveResponse>(`${BASE}/tenant/resolve`),
};

// ─── Search ───────────────────────────────────────────────────────────────

export const searchApi = {
  search: (params: Record<string, string | number | undefined>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) qs.set(k, String(v));
    }
    return apiFetch<SearchResponse>(`${SEARCH_BASE}/search?${qs}`);
  },
  suggest: (q: string) =>
    apiFetch<string[]>(`${SEARCH_BASE}/search/suggest?q=${encodeURIComponent(q)}`),
};
