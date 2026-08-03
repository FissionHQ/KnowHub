"use client";

import { useState } from "react";
import useSWR from "swr";
import { groupsApi, usersApi } from "@/lib/api";
import { membersForGroup, usersNotInGroup } from "@/components/admin/GroupMembershipChips";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import clsx from "clsx";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/ToastProvider";

export function GroupsSection() {
  const { data: me } = useSWR("users:me", usersApi.me);
  const isAdmin = me?.role === "admin";

  const { data: groups = [], mutate: mutateGroups } = useSWR(
    "settings:groups-manageable",
    groupsApi.listManageable,
  );
  const { data: users = [] } = useSWR("settings:users", usersApi.list);
  const { data: memberships = [], mutate: mutateMemberships } = useSWR(
    "settings:memberships",
    groupsApi.listMemberships,
  );
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [canCreateSpaces, setCanCreateSpaces] = useState(false);
  const [canManageGroups, setCanManageGroups] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const { toast } = useToast();

  async function refreshMembership() {
    await mutateMemberships();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await groupsApi.create({
        name,
        ...(isAdmin
          ? { canCreateSpaces, canManageGroups }
          : {}),
        ...(description ? { description } : {}),
      });
      setName("");
      setDescription("");
      setCanCreateSpaces(false);
      setCanManageGroups(false);
      await mutateGroups();
      toast(`Group "${name}" created`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to create group", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleCapability(
    groupId: string,
    field: "canCreateSpaces" | "canManageGroups",
    next: boolean,
  ) {
    setBusyKey(`perm:${groupId}`);
    try {
      await groupsApi.update(groupId, { [field]: next });
      await mutateGroups();
      const labels = {
        canCreateSpaces: next
          ? "Members of this group can create spaces"
          : "Create-space permission removed from this group",
        canManageGroups: next
          ? "Members of this group can create groups and grant space access"
          : "Group-management permission removed from this group",
      } as const;
      toast(labels[field], "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to update group", "error");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDelete(groupId: string, groupName: string) {
    if (!confirm(`Delete group "${groupName}"? Members will lose access granted via this group.`)) {
      return;
    }
    try {
      await groupsApi.delete(groupId);
      await mutateGroups();
      await refreshMembership();
      if (expandedGroupId === groupId) setExpandedGroupId(null);
      toast(`Group "${groupName}" deleted`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to delete group", "error");
    }
  }

  async function handleAddMember(groupId: string, userId: string) {
    setBusyKey(`${groupId}:${userId}`);
    try {
      await groupsApi.addMembers(groupId, [userId]);
      await refreshMembership();
      toast("Member added", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to add member", "error");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleRemoveMember(groupId: string, userId: string, userName: string) {
    if (!confirm(`Remove ${userName} from this group?`)) return;
    setBusyKey(`${groupId}:${userId}`);
    try {
      await groupsApi.removeMember(groupId, userId);
      await refreshMembership();
      toast(`${userName} removed from group`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to remove member", "error");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Create group
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            {isAdmin
              ? "Admins can manage every group. Capability flags below only apply when set by an admin."
              : "You can create groups and manage only the groups you create."}
          </p>
          <form onSubmit={handleCreate} className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                placeholder="Group name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-10 px-3 rounded-lg border border-border bg-card text-sm flex-1"
                required
              />
              <input
                placeholder="Description (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="h-10 px-3 rounded-lg border border-border bg-card text-sm flex-1"
              />
              <Button type="submit" variant="default" size="sm" disabled={submitting}>
                Create
              </Button>
            </div>
            {isAdmin && (
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm text-foreground/80 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={canCreateSpaces}
                    onChange={(e) => setCanCreateSpaces(e.target.checked)}
                    className="rounded border-border"
                  />
                  Allow members to create spaces
                </label>
                <label className="flex items-center gap-2 text-sm text-foreground/80 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={canManageGroups}
                    onChange={(e) => setCanManageGroups(e.target.checked)}
                    className="rounded border-border"
                  />
                  Allow members to create groups and grant space access
                </label>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {!isAdmin && (
        <p className="text-sm text-muted-foreground">
          Groups you created. You can manage members or delete them.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {groups.length === 0 ? (
          <Card>
            <CardContent className="px-4 py-8 text-sm text-muted-foreground text-center">
              {isAdmin ? "No groups yet." : "You have not created any groups yet."}
            </CardContent>
          </Card>
        ) : (
          groups.map((group) => {
            const members = membersForGroup(memberships, group.id);
            const availableUsers = usersNotInGroup(users, memberships, group.id);
            const expanded = expandedGroupId === group.id;

            return (
              <Card key={group.id}>
                <CardContent className="p-0">
                  <div className="flex items-center justify-between gap-3 px-4 py-4">
                    <button
                      type="button"
                      onClick={() => setExpandedGroupId(expanded ? null : group.id)}
                      className="flex-1 flex items-center justify-between gap-3 text-left min-w-0 hover:opacity-80 transition-opacity"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-foreground">{group.name}</p>
                          <Badge variant="secondary" className="text-xs">
                            {members.length} member{members.length === 1 ? "" : "s"}
                          </Badge>
                          {group.isDefault && (
                            <span className="text-xs text-primary">Default</span>
                          )}
                          {group.canCreateSpaces && (
                            <Badge variant="secondary" className="text-xs">
                              Can create spaces
                            </Badge>
                          )}
                          {group.canManageGroups && (
                            <Badge variant="secondary" className="text-xs">
                              Can manage groups
                            </Badge>
                          )}
                        </div>
                        {group.description && (
                          <p className="text-sm text-muted-foreground mt-0.5 truncate">
                            {group.description}
                          </p>
                        )}
                      </div>
                      {expanded ? (
                        <ChevronUp size={16} className="text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronDown size={16} className="text-muted-foreground shrink-0" />
                      )}
                    </button>
                    {!group.isDefault && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleDelete(group.id, group.name)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>

                  {expanded && (
                    <div className="px-4 pb-4 border-t border-border">
                      {isAdmin && (
                        <div className="flex flex-col gap-2 mt-4 mb-3">
                          <label className="flex items-center gap-2 text-sm text-foreground/80 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={Boolean(group.canCreateSpaces)}
                              disabled={busyKey === `perm:${group.id}`}
                              onChange={(e) =>
                                void handleToggleCapability(
                                  group.id,
                                  "canCreateSpaces",
                                  e.target.checked,
                                )
                              }
                              className="rounded border-border"
                            />
                            Members can create spaces
                          </label>
                          <label className="flex items-center gap-2 text-sm text-foreground/80 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={Boolean(group.canManageGroups)}
                              disabled={busyKey === `perm:${group.id}`}
                              onChange={(e) =>
                                void handleToggleCapability(
                                  group.id,
                                  "canManageGroups",
                                  e.target.checked,
                                )
                              }
                              className="rounded border-border"
                            />
                            Members can create groups and grant space access
                          </label>
                        </div>
                      )}
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 mt-4">
                        Members
                      </p>
                      {members.length === 0 ? (
                        <p className="text-sm text-muted-foreground mb-3">
                          No members in this group yet.
                        </p>
                      ) : (
                        <ul className="flex flex-col gap-2 mb-4">
                          {members.map((member) => (
                            <li
                              key={member.userId}
                              className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg border border-border bg-card"
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">
                                  {member.userName}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {member.userEmail}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <Badge variant="secondary" className="text-xs capitalize">
                                  {member.userStatus}
                                </Badge>
                                {!group.isDefault && (
                                  <button
                                    type="button"
                                    disabled={busyKey === `${group.id}:${member.userId}`}
                                    onClick={() =>
                                      handleRemoveMember(group.id, member.userId, member.userName)
                                    }
                                    className={clsx(
                                      "p-1.5 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors",
                                      busyKey === `${group.id}:${member.userId}` && "opacity-50",
                                    )}
                                    aria-label={`Remove ${member.userName}`}
                                  >
                                    <X size={14} />
                                  </button>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}

                      {availableUsers.length > 0 ? (
                        <div className="flex items-center gap-2">
                          <Select
                            value=""
                            onChange={(userId) => {
                              if (!userId) return;
                              void handleAddMember(group.id, userId);
                            }}
                            options={[
                              { value: "", label: "Add member…" },
                              ...availableUsers.map((u) => ({
                                value: u.id,
                                label: `${u.name} (${u.email})`,
                              })),
                            ]}
                            disabled={busyKey?.startsWith(`${group.id}:`) ?? false}
                            className="h-9 flex-1"
                          />
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          All active users are already in this group.
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
