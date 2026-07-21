"use client";

import { useState } from "react";
import useSWR from "swr";
import { groupsApi, usersApi } from "@/lib/api";
import { membersForGroup, usersNotInGroup } from "@/components/admin/GroupMembershipChips";
import { Button, Card, CardContent, Chip } from "@heroui/react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import clsx from "clsx";
import { Select } from "@/components/ui/Select";

export function GroupsSection() {
  const { data: groups = [], mutate: mutateGroups } = useSWR("admin:groups", groupsApi.list);
  const { data: users = [] } = useSWR("admin:users", usersApi.list);
  const { data: memberships = [], mutate: mutateMemberships } = useSWR(
    "admin:memberships",
    groupsApi.listMemberships,
  );
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function refreshMembership() {
    await mutateMemberships();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await groupsApi.create({
        name,
        ...(description ? { description } : {}),
      });
      setName("");
      setDescription("");
      await mutateGroups();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(groupId: string, groupName: string) {
    if (!confirm(`Delete group "${groupName}"? Members will lose access granted via this group.`)) {
      return;
    }
    await groupsApi.delete(groupId);
    await mutateGroups();
    await refreshMembership();
    if (expandedGroupId === groupId) setExpandedGroupId(null);
  }

  async function handleAddMember(groupId: string, userId: string) {
    setBusyKey(`${groupId}:${userId}`);
    try {
      await groupsApi.addMembers(groupId, [userId]);
      await refreshMembership();
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
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
            Create group
          </h2>
          <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3">
            <input
              placeholder="Group name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm flex-1"
              required
            />
            <input
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-10 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm flex-1"
            />
            <Button type="submit" variant="primary" size="sm" isDisabled={submitting}>
              Create
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {groups.map((group) => {
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
                        <p className="font-medium text-zinc-900 dark:text-zinc-100">{group.name}</p>
                        <Chip size="sm" variant="secondary" className="text-xs">
                          {members.length} member{members.length === 1 ? "" : "s"}
                        </Chip>
                        {group.isDefault && (
                          <span className="text-xs text-[#f25011]">Default</span>
                        )}
                      </div>
                      {group.description && (
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                          {group.description}
                        </p>
                      )}
                    </div>
                    {expanded ? (
                      <ChevronUp size={16} className="text-zinc-400 shrink-0" />
                    ) : (
                      <ChevronDown size={16} className="text-zinc-400 shrink-0" />
                    )}
                  </button>
                  {!group.isDefault && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onPress={() => handleDelete(group.id, group.name)}
                    >
                      Delete
                    </Button>
                  )}
                </div>

                {expanded && (
                  <div className="px-4 pb-4 border-t border-zinc-100 dark:border-zinc-800">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mt-4 mb-2">
                      Members
                    </p>
                    {members.length === 0 ? (
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-3">
                        No members in this group yet.
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-2 mb-4">
                        {members.map((member) => (
                          <li
                            key={member.userId}
                            className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                                {member.userName}
                              </p>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                                {member.userEmail}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Chip size="sm" variant="secondary" className="text-xs capitalize">
                                {member.userStatus}
                              </Chip>
                              <button
                                type="button"
                                disabled={busyKey === `${group.id}:${member.userId}`}
                                onClick={() =>
                                  handleRemoveMember(group.id, member.userId, member.userName)
                                }
                                className={clsx(
                                  "p-1.5 rounded-md text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors",
                                  busyKey === `${group.id}:${member.userId}` && "opacity-50",
                                )}
                                aria-label={`Remove ${member.userName}`}
                              >
                                <X size={14} />
                              </button>
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
                        options={[{ value: "", label: "Add member…" }, ...availableUsers.map((u) => ({ value: u.id, label: `${u.name} (${u.email})` }))]}
                        disabled={busyKey?.startsWith(`${group.id}:`) ?? false}
                        className="h-9 flex-1"
                      />
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-400">
                        All active users are already in this group.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
