export type UserRole = "admin" | "member" | "viewer";

export type UserStatus = "active" | "invited" | "deactivated";

export type AccessLevel = "view" | "edit";

export type DocumentType = "page" | "pdf" | "pptx";

export type DocumentStatus = "draft" | "published" | "trashed";

export type DocumentVisibility = "inherit" | "restricted";

export type ScanStatus = "pending" | "scanning" | "clean" | "infected" | "error";

export type AuditAction =
  | "user.invite"
  | "user.activate"
  | "user.deactivate"
  | "user.role_change"
  | "group.create"
  | "group.update"
  | "group.delete"
  | "group.member_add"
  | "group.member_remove"
  | "space.create"
  | "space.delete"
  | "space.permission_change"
  | "document.create"
  | "document.update"
  | "document.delete"
  | "document.purge"
  | "document.restore"
  | "document.version_restore"
  | "document.permission_change"
  | "attachment.upload"
  | "attachment.scan_result"
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout"
  | "org.settings_update";
