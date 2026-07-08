"use client";

import { useState } from "react";
import useSWR from "swr";
import { documentsApi, groupsApi, usersApi } from "@/lib/api";
import type { AccessLevel } from "@wiki/types";
import { Button, Card, CardContent } from "@heroui/react";
import { ChevronDown, ChevronUp, Shield, Users, User } from "lucide-react";

interface Props {
  documentId: string;
}

type GranteeType = "group" | "user";

export function DocumentPermissionsPanel({ documentId }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [granteeType, setGranteeType] = useState<GranteeType>("group");
  const [granteeId, setGranteeId] = useState("");
  const [accessLevel, setAccessLevel] = useState<AccessLevel>("view");
  const [submitting, setSubmitting] = useState(false);

  const { data, error, mutate, isLoading } = useSWR(
    `doc-perms:${documentId}`,
    () => documentsApi.listPermissions(documentId),
  );
  const { data: groups = [] } = useSWR(expanded ? "groups" : null, groupsApi.list);
  const { data: users = [] } = useSWR(expanded ? "users" : null, usersApi.list);

  if (error || isLoading || !data) return null;

  const availableGroups = groups.filter(
    (g) => !data.overrides.some((o) => o.groupId === g.id),
  );
  const availableUsers = users.filter(
    (u) => u.status === "active" && !data.overrides.some((o) => o.userId === u.id),
  );
  const selectedGranteeId =
    granteeId ||
    (granteeType === "group" ? availableGroups[0]?.id : availableUsers[0]?.id) ||
    "";

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedGranteeId) return;
    setSubmitting(true);
    try {
      await documentsApi.setPermission(documentId, {
        ...(granteeType === "group"
          ? { groupId: selectedGranteeId }
          : { userId: selectedGranteeId }),
        accessLevel,
      });
      setGranteeId("");
      await mutate();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAccessChange(permissionId: string, level: AccessLevel) {
    await documentsApi.updatePermission(documentId, permissionId, level);
    await mutate();
  }

  async function handleRemove(permissionId: string, label: string) {
    if (!confirm(`Remove permission override for ${label}?`)) return;
    await documentsApi.deletePermission(documentId, permissionId);
    await mutate();
  }

  return (
    <Card className="mb-5 border-violet-100 dark:border-violet-900/40">
      <CardContent className="p-0">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
        >
          <span className="inline-flex items-center gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
            <Shield size={16} className="text-violet-600 dark:text-violet-400" />
            Document permissions
          </span>
          {expanded ? (
            <ChevronUp size={16} className="text-zinc-400 shrink-0" />
          ) : (
            <ChevronDown size={16} className="text-zinc-400 shrink-0" />
          )}
        </button>

        {expanded && (
          <div className="px-4 pb-4 space-y-5 border-t border-zinc-100 dark:border-zinc-800">
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-2">
                Inherited from space
              </h3>
              {data.inherited.length === 0 ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No space-level group permissions configured.
                </p>
              ) : (
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                  {data.inherited.map((perm) => (
                    <li
                      key={perm.groupId}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 bg-zinc-50/50 dark:bg-zinc-900/50 text-sm"
                    >
                      <span className="inline-flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                        <Users size={14} className="text-zinc-400" />
                        {perm.groupName}
                      </span>
                      <AccessBadge level={perm.accessLevel} />
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-zinc-400 mt-2">
                Users without a document override inherit these space permissions.
              </p>
            </section>

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-2">
                Document overrides
              </h3>
              {data.overrides.length === 0 ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-3">
                  No document-specific permissions. Add an override to restrict or grant access
                  for a group or user.
                </p>
              ) : (
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden mb-3">
                  {data.overrides.map((perm) => {
                    const label = perm.groupId
                      ? perm.groupName ?? "Group"
                      : perm.userName ?? perm.userEmail ?? "User";
                    return (
                      <li
                        key={perm.id}
                        className="flex items-center justify-between gap-3 px-3 py-2.5 bg-white dark:bg-zinc-900 text-sm"
                      >
                        <span className="inline-flex items-center gap-2 min-w-0 text-zinc-700 dark:text-zinc-300">
                          {perm.groupId ? (
                            <Users size={14} className="text-zinc-400 shrink-0" />
                          ) : (
                            <User size={14} className="text-zinc-400 shrink-0" />
                          )}
                          <span className="truncate">
                            {label}
                            {perm.userEmail && perm.userName && (
                              <span className="text-zinc-400 ml-1">({perm.userEmail})</span>
                            )}
                          </span>
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <select
                            value={perm.accessLevel}
                            onChange={(e) =>
                              handleAccessChange(perm.id, e.target.value as AccessLevel)
                            }
                            className="h-8 px-2 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs"
                          >
                            <option value="view">View</option>
                            <option value="edit">Edit</option>
                          </select>
                          <Button
                            variant="secondary"
                            size="sm"
                            onPress={() => handleRemove(perm.id, label)}
                          >
                            Remove
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                <select
                  value={granteeType}
                  onChange={(e) => {
                    setGranteeType(e.target.value as GranteeType);
                    setGranteeId("");
                  }}
                  className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
                >
                  <option value="group">Group</option>
                  <option value="user">User</option>
                </select>
                <select
                  value={selectedGranteeId}
                  onChange={(e) => setGranteeId(e.target.value)}
                  className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
                >
                  {granteeType === "group"
                    ? availableGroups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))
                    : availableUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.email})
                        </option>
                      ))}
                </select>
                <select
                  value={accessLevel}
                  onChange={(e) => setAccessLevel(e.target.value as AccessLevel)}
                  className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
                >
                  <option value="view">View access</option>
                  <option value="edit">Edit access</option>
                </select>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isDisabled={submitting || !selectedGranteeId}
                >
                  Add override
                </Button>
              </form>
            </section>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AccessBadge({ level }: { level: AccessLevel }) {
  const isEdit = level === "edit";
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
        isEdit
          ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
      }`}
    >
      {isEdit ? "Edit" : "View"}
    </span>
  );
}
