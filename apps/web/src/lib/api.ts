import type {
  Document,
  Comment,
  Space,
  Group,
  User,
  Organization,
  AuditLogEntry,
  SearchResponse,
  CreateDocumentBody,
  UpdateDocumentBody,
  CreateCommentBody,
  UpdateCommentBody,
  CreateSpaceBody,
  UpdateSpacePermissionsBody,
  SpacePermissionRecord,
  InviteUserBody,
  UpdateOrgSettingsBody,
  AuditLogQuery,
  DocumentPermissionsResponse,
  DocumentPermissionRecord,
  SetDocumentPermissionBody,
  DocumentVersionListItem,
  TrashedDocument,
  AccessLevel,
  LoginBody,
  LoginResponse,
  AcceptInviteBody,
  InviteDetails,
  PendingInvite,
  GroupMembershipEntry,
} from "@wiki/types";

const BASE = "/api";
const SEARCH_BASE = "/api";

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
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
  /** Admin: all spaces. Others: spaces they created. */
  listOwned: () => apiFetch<Space[]>(`${BASE}/spaces?scope=owned`),
  get: (id: string) => apiFetch<Space>(`${BASE}/spaces/${id}`),
  create: (body: CreateSpaceBody) =>
    apiFetch<Space>(`${BASE}/spaces`, { method: "POST", body: JSON.stringify(body) }),
  getPermissions: (id: string) =>
    apiFetch<SpacePermissionRecord[]>(`${BASE}/spaces/${id}/permissions`),
  updatePermissions: (id: string, body: UpdateSpacePermissionsBody) =>
    apiFetch<{ spaceId: string; groupPermissions: UpdateSpacePermissionsBody["groupPermissions"] }>(
      `${BASE}/spaces/${id}/permissions`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
  grantPermission: (
    id: string,
    body: { groupId: string; accessLevel: AccessLevel },
  ) =>
    apiFetch<{ spaceId: string; groupId: string; accessLevel: AccessLevel }>(
      `${BASE}/spaces/${id}/permissions/grant`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  revokePermission: (id: string, groupId: string) =>
    apiFetch<{ removed: boolean; spaceId: string; groupId: string }>(
      `${BASE}/spaces/${id}/permissions/${groupId}`,
      { method: "DELETE" },
    ),
  delete: (id: string) =>
    apiFetch<{ deleted: boolean }>(`${BASE}/spaces/${id}`, { method: "DELETE" }),
};

// ─── Documents ────────────────────────────────────────────────────────────

export const documentsApi = {
  listBySpace: (spaceId: string) =>
    apiFetch<Document[]>(`${BASE}/spaces/${spaceId}/documents`),
  get: (id: string) => apiFetch<Document>(`${BASE}/documents/${id}`),
  create: (body: CreateDocumentBody) =>
    apiFetch<Document>(`${BASE}/documents`, { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: UpdateDocumentBody) =>
    apiFetch<Document>(`${BASE}/documents/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (id: string) =>
    apiFetch<{ trashed: boolean }>(`${BASE}/documents/${id}`, { method: "DELETE" }),
  restore: (id: string) =>
    apiFetch<Document>(`${BASE}/documents/${id}/restore`, { method: "POST" }),
  listTrash: () => apiFetch<TrashedDocument[]>(`${BASE}/trash`),
  getVersions: (id: string) =>
    apiFetch<DocumentVersionListItem[]>(`${BASE}/documents/${id}/versions`),
  restoreVersion: async (id: string, versionNumber: number) => {
    const res = await fetch(`${BASE}/documents/${id}/versions/${versionNumber}/restore`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: "Unknown error" } }));
      throw new Error((err as { error?: { message?: string } }).error?.message ?? "Request failed");
    }

    const json = (await res.json()) as { data: Document; reloadRequired?: boolean };
    return { document: json.data, reloadRequired: json.reloadRequired ?? false };
  },
  discardDraft: async (id: string) => {
    const res = await fetch(`${BASE}/documents/${id}/discard-draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: "Unknown error" } }));
      throw new Error((err as { error?: { message?: string } }).error?.message ?? "Request failed");
    }

    const json = (await res.json()) as { data: Document; reloadRequired?: boolean };
    return { document: json.data, reloadRequired: json.reloadRequired ?? false };
  },
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
  listByDocument: (documentId: string) =>
    apiFetch<Array<{
      attachmentId: string;
      scanStatus: string;
      ready: boolean;
      originalName: string;
      createdAt: string;
    }>>(`${BASE}/documents/${documentId}/attachments`),
  upload: async (documentId: string, file: File): Promise<{ attachmentId: string }> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/documents/${documentId}/attachments`, {
      method: "POST",
      body: form,
      credentials: "include",
    });
    if (!res.ok) throw new Error("Upload failed");
    const json = await res.json() as { data: { attachmentId: string } };
    return json.data;
  },
  replacePdf: async (documentId: string, file: File): Promise<{ attachmentId: string }> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/documents/${documentId}/attachments/replace`, {
      method: "POST",
      body: form,
      credentials: "include",
    });
    if (!res.ok) throw new Error("Replace failed");
    const json = await res.json() as { data: { attachmentId: string } };
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
  /** Same-origin proxy — avoids S3 CORS when viewing in the browser (e.g. LocalStack). */
  viewProxyUrl: (attachmentId: string) => `/proxy/attachments/${attachmentId}`,
};

// ─── Groups ───────────────────────────────────────────────────────────────

export const groupsApi = {
  list: () => apiFetch<Group[]>(`${BASE}/groups`),
  /** Admin: all groups. Others with manage permission: only groups they created. */
  listManageable: () => apiFetch<Group[]>(`${BASE}/groups?scope=manageable`),
  listMemberships: () => apiFetch<GroupMembershipEntry[]>(`${BASE}/groups/memberships`),
  create: (body: {
    name: string;
    description?: string;
    canCreateSpaces?: boolean;
    canManageGroups?: boolean;
  }) => apiFetch<Group>(`${BASE}/groups`, { method: "POST", body: JSON.stringify(body) }),
  update: (
    id: string,
    body: {
      name?: string;
      description?: string | null;
      canCreateSpaces?: boolean;
      canManageGroups?: boolean;
    },
  ) =>
    apiFetch<Group>(`${BASE}/groups/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
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
    if (params.action !== undefined) qs.set("action", params.action);
    if (params.from !== undefined) qs.set("from", params.from);
    if (params.to !== undefined) qs.set("to", params.to);
    const query = qs.toString();
    return apiFetch<(AuditLogEntry & { actorName?: string; actorEmail?: string })[]>(
      `${BASE}/admin/audit-log${query ? `?${query}` : ""}`,
    );
  },
};

// ─── Comments ─────────────────────────────────────────────────────────────

export const commentsApi = {
  list: (documentId: string) =>
    apiFetch<Comment[]>(`${BASE}/documents/${documentId}/comments`),
  create: (documentId: string, body: CreateCommentBody) =>
    apiFetch<Comment>(`${BASE}/documents/${documentId}/comments`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  update: (documentId: string, commentId: string, body: UpdateCommentBody) =>
    apiFetch<Comment>(`${BASE}/documents/${documentId}/comments/${commentId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  delete: (documentId: string, commentId: string) =>
    apiFetch<{ deleted: boolean }>(`${BASE}/documents/${documentId}/comments/${commentId}`, {
      method: "DELETE",
    }),
};

// ─── User Activity ────────────────────────────────────────────────────────

export const activityApi = {
  recordView: (documentId: string) =>
    apiFetch<{ recorded: boolean }>(`${BASE}/documents/${documentId}/view`, { method: "POST", body: "{}" }),
  getRecent: () => apiFetch<Document[]>(`${BASE}/users/me/recent`),
  getRecentlyUpdated: () => apiFetch<Document[]>(`${BASE}/users/me/recently-updated`),
  toggleFavorite: (documentId: string) =>
    apiFetch<{ favorited: boolean }>(`${BASE}/documents/${documentId}/favorite`, { method: "POST", body: "{}" }),
  isFavorited: (documentId: string) =>
    apiFetch<{ favorited: boolean }>(`${BASE}/documents/${documentId}/favorite`),
  getFavorites: () => apiFetch<Document[]>(`${BASE}/users/me/favorites`),
};

// ─── Trash ────────────────────────────────────────────────────────────────

export const trashApi = {
  list: () => apiFetch<Document[]>(`${BASE}/trash`),
  restore: (documentId: string) =>
    apiFetch<Document>(`${BASE}/trash/${documentId}/restore`, { method: "POST", body: "{}" }),
  permanentDelete: (documentId: string) =>
    apiFetch<{ deleted: boolean }>(`${BASE}/trash/${documentId}`, { method: "DELETE" }),
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
  suggest: (q: string, spaceId?: string) => {
    const qs = new URLSearchParams({ q });
    if (spaceId) qs.set("spaceId", spaceId);
    return apiFetch<string[]>(`${SEARCH_BASE}/search/suggest?${qs}`);
  },
};
