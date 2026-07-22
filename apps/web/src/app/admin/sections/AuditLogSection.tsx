"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { adminApi } from "@/lib/api";
import { Skeleton } from "@heroui/react";
import { Shield, Users, FileText, Key, Settings, Activity, Download, ChevronLeft, ChevronRight, Search } from "lucide-react";
import type { AuditAction } from "@wiki/types";

// ─── Action metadata ────────────────────────────────────────────────────────

type Category = "all" | "auth" | "users" | "documents" | "spaces" | "org";

const ACTION_META: Record<AuditAction, { label: string; category: Exclude<Category, "all">; color: string }> = {
  "auth.login":               { label: "Login",            category: "auth",      color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  "auth.login_failed":        { label: "Login failed",     category: "auth",      color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  "auth.logout":              { label: "Logout",           category: "auth",      color: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" },
  "user.invite":              { label: "Invite",           category: "users",     color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  "user.activate":            { label: "Activated",        category: "users",     color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  "user.deactivate":          { label: "Deactivated",      category: "users",     color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  "user.role_change":         { label: "Role changed",     category: "users",     color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  "group.create":             { label: "Group created",    category: "users",     color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  "group.delete":             { label: "Group deleted",    category: "users",     color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  "group.member_add":         { label: "Member added",     category: "users",     color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  "group.member_remove":      { label: "Member removed",   category: "users",     color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  "space.create":             { label: "Space created",    category: "spaces",    color: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" },
  "space.delete":             { label: "Space deleted",    category: "spaces",    color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  "space.permission_change":  { label: "Permissions",      category: "spaces",    color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  "document.create":          { label: "Created",          category: "documents", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  "document.update":          { label: "Updated",          category: "documents", color: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" },
  "document.delete":          { label: "Trashed",          category: "documents", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  "document.purge":           { label: "Purged",           category: "documents", color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  "document.restore":         { label: "Restored",         category: "documents", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  "document.version_restore": { label: "Version restored", category: "documents", color: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" },
  "document.permission_change":{ label: "Permissions",     category: "documents", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  "attachment.upload":        { label: "Upload",           category: "documents", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  "attachment.scan_result":   { label: "Scan result",      category: "documents", color: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" },
  "org.settings_update":      { label: "Settings updated", category: "org",       color: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" },
};

const CATEGORIES: { id: Category; label: string; icon: React.ReactNode }[] = [
  { id: "all",       label: "All activity",  icon: <Activity size={14} /> },
  { id: "auth",      label: "Auth",          icon: <Key size={14} /> },
  { id: "users",     label: "Users & Groups",icon: <Users size={14} /> },
  { id: "documents", label: "Documents",     icon: <FileText size={14} /> },
  { id: "spaces",    label: "Spaces",        icon: <Shield size={14} /> },
  { id: "org",       label: "Organisation",  icon: <Settings size={14} /> },
];

// ─── Readable detail renderer ───────────────────────────────────────────────

const DETAIL_LABELS: Record<string, string> = {
  title: "Document",
  spaceName: "Space",
  name: "Name",
  email: "Email",
  role: "Role",
  newRole: "New role",
  previousRole: "Previous role",
  accessLevel: "Access",
  operation: "Operation",
  groupName: "Group",
  userName: "User",
  userEmail: "User email",
  fileName: "File",
  fileType: "Type",
  sizeBytes: "Size",
  scanStatus: "Scan",
  fromVersion: "From version",
  toVersion: "To version",
  previousStatus: "Previous status",
  restoredStatus: "Restored status",
  changes: "Changes",
};

const HIDDEN_KEYS = new Set(["documentId", "spaceId", "type"]);

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (key === "sizeBytes" && typeof value === "number") {
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function DetailRow({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="text-zinc-400 dark:text-zinc-500 shrink-0 w-28">{label}</span>
      <span className="text-zinc-700 dark:text-zinc-200 break-all">{formatValue(label, value)}</span>
    </div>
  );
}

function DetailsCell({ target }: { target: Record<string, unknown> }) {
  const entries = Object.entries(target).filter(([k]) => !HIDDEN_KEYS.has(k));
  if (entries.length === 0) return <span className="text-zinc-400 text-xs">—</span>;
  return (
    <div className="flex flex-col gap-1">
      {entries.map(([k, v]) => (
        <DetailRow key={k} label={DETAIL_LABELS[k] ?? k} value={v} />
      ))}
    </div>
  );
}

// ─── Export helper ──────────────────────────────────────────────────────────

function exportCsv(entries: ReturnType<typeof useEntries>["entries"]) {
  const rows = [["Time", "Actor", "Action", "Details", "IP"]];
  for (const e of entries) {
    rows.push([
      new Date(e.timestamp).toISOString(),
      e.actorName ?? e.actorEmail ?? "System",
      ACTION_META[e.action as AuditAction]?.label ?? e.action,
      JSON.stringify(e.target),
      e.ipAddress ?? "",
    ]);
  }
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Data hook ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

function useEntries(category: Category, search: string, page: number, from: string, to: string) {
  const { data = [], isLoading } = useSWR(
    `admin:audit-log:${category}:${page}:${from}:${to}`,
    () => adminApi.getAuditLog({ limit: 200, offset: 0, ...(from ? { from } : {}), ...(to ? { to } : {}) }),
    { keepPreviousData: true },
  );

  const filtered = useMemo(() => {
    let result = data;
    if (category !== "all") {
      result = result.filter((e) => ACTION_META[e.action as AuditAction]?.category === category);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((e) =>
        (e.actorName ?? "").toLowerCase().includes(q) ||
        (e.actorEmail ?? "").toLowerCase().includes(q) ||
        e.action.toLowerCase().includes(q) ||
        JSON.stringify(e.target).toLowerCase().includes(q),
      );
    }
    return result;
  }, [data, category, search]);

  const total = filtered.length;
  const entries = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  return { entries, total, isLoading, allFiltered: filtered };
}

// ─── Main component ──────────────────────────────────────────────────────────

export function AuditLogSection() {
  const [category, setCategory] = useState<Category>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [from] = useState("");
  const [to] = useState("");

  const { entries, total, isLoading, allFiltered } = useEntries(category, search, page, from, to);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  function handleCategoryChange(c: Category) {
    setCategory(c);
    setPage(0);
  }

  function handleSearch(v: string) {
    setSearch(v);
    setPage(0);
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex items-center gap-1 flex-wrap border-b border-zinc-200 dark:border-zinc-800 pb-0">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => handleCategoryChange(cat.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              category === cat.id
                ? "border-[#f25011] text-[#f25011]"
                : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
            }`}
          >
            {cat.icon}
            {cat.label}
          </button>
        ))}
      </div>

      {/* Filters row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search actor, action, details…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#f25011]/30"
          />
        </div>
        {/* <input
          type="date"
          value={from}
          onChange={(e) => { setFrom(e.target.value); setPage(0); }}
          className="px-3 py-1.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-[#f25011]/30"
          title="From date"
        />
        <span className="text-zinc-400 text-sm">to</span>
        <input
          type="date"
          value={to}
          onChange={(e) => { setTo(e.target.value); setPage(0); }}
          className="px-3 py-1.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-[#f25011]/30"
          title="To date"
        /> */}
        <button
          type="button"
          onClick={() => exportCsv(allFiltered)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
        >
          <Download size={14} />
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-left text-zinc-500 dark:text-zinc-400">
                <th className="px-4 py-3 font-medium whitespace-nowrap">Time</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Actor</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Action</th>
                <th className="px-4 py-3 font-medium">Details</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">IP</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800/80">
                  <td className="px-4 py-3"><Skeleton className="h-4 w-32 rounded" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-24 rounded" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-5 w-20 rounded-full" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-48 rounded" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-24 rounded" /></td>
                </tr>
              ))}

              {!isLoading && entries.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-zinc-400 text-sm">
                    No audit events found.
                  </td>
                </tr>
              )}

              {entries.map((entry) => {
                const meta = ACTION_META[entry.action as AuditAction];
                const actor = entry.actorName ?? entry.actorEmail ?? "System";
                const ts = new Date(entry.timestamp);
                return (
                  <tr
                    key={entry.id}
                    className="border-b border-zinc-100 dark:border-zinc-800/80 last:border-0 align-top hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors"
                  >
                    {/* Time */}
                    <td className="px-4 py-3 whitespace-nowrap text-zinc-500 dark:text-zinc-400 text-xs">
                      <div>{ts.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</div>
                      <div className="text-zinc-400">{ts.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
                    </td>

                    {/* Actor */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-zinc-800 dark:text-zinc-100 text-xs font-medium">{actor}</div>
                      {entry.actorName && entry.actorEmail && (
                        <div className="text-zinc-400 text-xs">{entry.actorEmail}</div>
                      )}
                    </td>

                    {/* Action chip */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${meta?.color ?? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"}`}>
                        {meta?.label ?? entry.action}
                      </span>
                    </td>

                    {/* Details */}
                    <td className="px-4 py-3 max-w-xs">
                      <DetailsCell target={entry.target as Record<string, unknown>} />
                    </td>

                    {/* IP */}
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-zinc-400 dark:text-zinc-500 font-mono">
                      {entry.ipAddress ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
          <span>{total} events · page {page + 1} of {totalPages}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
