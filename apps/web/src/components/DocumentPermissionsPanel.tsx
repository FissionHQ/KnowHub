"use client";

import { useState } from "react";
import useSWR from "swr";
import { documentsApi, groupsApi, usersApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { AccessLevel, User, UserRole } from "@wiki/types";
import { Button, Skeleton } from "@heroui/react";
import { Users, User as UserIcon, Globe, Lock } from "lucide-react";
import { Select } from "@/components/ui/Select";
import type { DocumentVisibility } from "@wiki/types";

function canGrantDocumentPermissionToUser(
  actorRole: UserRole,
  actorId: string,
  target: Pick<User, "id" | "role">,
): boolean {
  if (actorId === target.id) return false;
  if (target.role === "admin" && actorRole !== "admin") return false;
  return true;
}

interface Props {
  documentId: string;
}

type GranteeType = "group" | "user";

export function DocumentPermissionsPanel({ documentId }: Props) {
  const { user: currentUser } = useAuth();
  const [granteeType, setGranteeType] = useState<GranteeType>("group");
  const [granteeId, setGranteeId] = useState("");
  const [accessLevel, setAccessLevel] = useState<AccessLevel>("view");
  const [submitting, setSubmitting] = useState(false);
  const [savingVisibility, setSavingVisibility] = useState(false);

  const { data, error, mutate, isLoading } = useSWR(
    `doc-perms:${documentId}`,
    () => documentsApi.listPermissions(documentId),
  );
  // Shares the same SWR key as DocumentView so the document view stays in sync.
  const { data: doc, mutate: mutateDoc } = useSWR(
    `doc:${documentId}`,
    () => documentsApi.get(documentId),
  );
  const { data: groups = [] } = useSWR("groups", groupsApi.list);
  const { data: users = [] } = useSWR("users", usersApi.list);

  const visibility: DocumentVisibility = doc?.visibility ?? "inherit";
  const isRestricted = visibility === "restricted";

  async function handleVisibilityChange(next: DocumentVisibility) {
    if (next === visibility || savingVisibility) return;
    setSavingVisibility(true);
    try {
      const updated = await documentsApi.update(documentId, { visibility: next });
      await mutateDoc(updated, false);
    } finally {
      setSavingVisibility(false);
    }
  }

  if (error) return null;

  if (isLoading || !data) {
    return (
      <div className="p-5 space-y-4">
        <Skeleton className="w-1/3 h-4 rounded-md" />
        <Skeleton className="w-full h-16 rounded-lg" />
        <Skeleton className="w-1/3 h-4 rounded-md" />
        <Skeleton className="w-full h-16 rounded-lg" />
      </div>
    );
  }

  const availableGroups = groups.filter(
    (g) => !data.overrides.some((o) => o.groupId === g.id),
  );
  const availableUsers = users.filter(
    (u) =>
      u.status === "active" &&
      !data.overrides.some((o) => o.userId === u.id) &&
      currentUser &&
      canGrantDocumentPermissionToUser(currentUser.role, currentUser.id, u),
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
    <div className="p-5 space-y-6">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-2">
          Access mode
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <VisibilityOption
            active={!isRestricted}
            disabled={savingVisibility}
            icon={<Globe size={15} />}
            title="Inherit"
            description="Everyone with space access can view. Shares below add extra people."
            onSelect={() => handleVisibilityChange("inherit")}
          />
          <VisibilityOption
            active={isRestricted}
            disabled={savingVisibility}
            icon={<Lock size={15} />}
            title="Restricted"
            description="Only the people and groups listed below (plus owner and admins)."
            onSelect={() => handleVisibilityChange("restricted")}
          />
        </div>
      </section>

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
          {isRestricted
            ? "This document is restricted, so inherited space access does not apply — only the overrides below grant access."
            : "Everyone with space access can view this document. Overrides below grant additional access on top of this."}
        </p>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-2">
          Document overrides
        </h3>
        {data.overrides.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-3">
            {isRestricted
              ? "No one is listed yet. Add a group or user below to grant them access to this restricted document."
              : "No document-specific permissions. Add an override to grant a specific group or user extra access on top of the space defaults."}
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden mb-3">
            {data.overrides.map((perm) => {
              const label = perm.groupId
                ? (perm.groupName ?? "Group")
                : (perm.userName ?? perm.userEmail ?? "User");
              const targetUser = perm.userId
                ? users.find((u) => u.id === perm.userId)
                : undefined;
              const canManageOverride =
                !perm.userId ||
                (currentUser &&
                  targetUser &&
                  canGrantDocumentPermissionToUser(
                    currentUser.role,
                    currentUser.id,
                    targetUser,
                  ));
              return (
                <li
                  key={perm.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 bg-white dark:bg-zinc-900 text-sm"
                >
                  <span className="inline-flex items-center gap-2 min-w-0 text-zinc-700 dark:text-zinc-300">
                    {perm.groupId ? (
                      <Users size={14} className="text-zinc-400 shrink-0" />
                    ) : (
                      <UserIcon size={14} className="text-zinc-400 shrink-0" />
                    )}
                    <span className="truncate">
                      {label}
                      {perm.userEmail && perm.userName && (
                        <span className="text-zinc-400 ml-1">({perm.userEmail})</span>
                      )}
                    </span>
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    {canManageOverride ? (
                      <>
                        <Select
                          value={perm.accessLevel}
                          onChange={(v) => handleAccessChange(perm.id, v as AccessLevel)}
                          options={[{ value: "view", label: "View" }, { value: "edit", label: "Edit" }]}
                          className="h-8 w-24"
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          onPress={() => handleRemove(perm.id, label)}
                        >
                          Remove
                        </Button>
                      </>
                    ) : (
                      <AccessBadge level={perm.accessLevel} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <form onSubmit={handleAdd} className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Select
              value={granteeType}
              onChange={(v) => { setGranteeType(v as GranteeType); setGranteeId(""); }}
              options={[{ value: "group", label: "Group" }, { value: "user", label: "User" }]}
            />
            <Select
              value={accessLevel}
              onChange={(v) => setAccessLevel(v as AccessLevel)}
              options={[{ value: "view", label: "View access" }, { value: "edit", label: "Edit access" }]}
            />
          </div>
          <Select
            value={selectedGranteeId}
            onChange={setGranteeId}
            options={
              granteeType === "group"
                ? availableGroups.length === 0
                  ? [{ value: "", label: "No groups available" }]
                  : availableGroups.map((g) => ({ value: g.id, label: g.name }))
                : availableUsers.length === 0
                  ? [{ value: "", label: "No users available" }]
                  : availableUsers.map((u) => ({ value: u.id, label: `${u.name} (${u.email})` }))
            }
          />
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isDisabled={submitting || !selectedGranteeId}
            className="w-full"
          >
            Add override
          </Button>
        </form>
      </section>
    </div>
  );
}

function VisibilityOption({
  active,
  disabled,
  icon,
  title,
  description,
  onSelect,
}: {
  active: boolean;
  disabled: boolean;
  icon: React.ReactNode;
  title: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onSelect}
      className={`flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors disabled:opacity-60 ${
        active
          ? "border-[#f25011] bg-orange-50 dark:bg-orange-950/30"
          : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 bg-white dark:bg-zinc-900"
      }`}
    >
      <span
        className={`inline-flex items-center gap-1.5 text-sm font-medium ${
          active ? "text-[#f25011]" : "text-zinc-700 dark:text-zinc-200"
        }`}
      >
        {icon}
        {title}
      </span>
      <span className="text-xs text-zinc-500 dark:text-zinc-400 leading-snug">
        {description}
      </span>
    </button>
  );
}

function AccessBadge({ level }: { level: AccessLevel }) {
  const isEdit = level === "edit";
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
        isEdit
          ? "bg-orange-100 text-[#f25011] dark:bg-orange-900/40 dark:text-orange-300"
          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
      }`}
    >
      {isEdit ? "Edit" : "View"}
    </span>
  );
}
