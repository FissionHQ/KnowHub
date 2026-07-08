"use client";

import { useState } from "react";
import useSWR from "swr";
import { groupsApi, usersApi } from "@/lib/api";
import { UserGroupChips, GroupSelectChips } from "@/components/admin/GroupMembershipChips";
import type { User, UserRole } from "@wiki/types";
import { Button, Card, CardContent, Chip } from "@heroui/react";

const ROLES: UserRole[] = ["admin", "member", "viewer"];

export function UsersSection() {
  const { data: users = [], mutate } = useSWR("admin:users", usersApi.list);
  const { data: invites = [], mutate: mutateInvites } = useSWR(
    "admin:invites",
    usersApi.listInvites,
  );
  const { data: groups = [] } = useSWR("admin:groups", groupsApi.list);
  const { data: memberships = [], mutate: mutateMemberships } = useSWR(
    "admin:memberships",
    groupsApi.listMemberships,
  );
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>("member");
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  async function toggleUserGroup(userId: string, groupId: string, isMember: boolean) {
    setBusyUserId(userId);
    try {
      if (isMember) {
        await groupsApi.removeMember(groupId, userId);
      } else {
        await groupsApi.addMembers(groupId, [userId]);
      }
      await mutateMemberships();
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setLastInviteUrl(null);
    try {
      const result = await usersApi.invite({ email, name, role, groupIds });
      setLastInviteUrl(result.inviteUrl);
      setEmail("");
      setName("");
      setRole("member");
      setGroupIds([]);
      await mutate();
      await mutateInvites();
      await mutateMemberships();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to invite user");
    } finally {
      setSubmitting(false);
    }
  }

  async function changeRole(user: User, nextRole: UserRole) {
    await usersApi.changeRole(user.id, nextRole);
    await mutate();
  }

  async function deactivate(user: User) {
    if (!confirm(`Deactivate ${user.email}?`)) return;
    await usersApi.deactivate(user.id);
    await mutate();
    await mutateInvites();
  }

  async function resendInvite(userId: string) {
    const result = await usersApi.resendInvite(userId);
    setLastInviteUrl(result.inviteUrl);
    await mutateInvites();
  }

  function toggleGroup(groupId: string) {
    setGroupIds((current) =>
      current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId],
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
            Invite user
          </h2>
          <form onSubmit={handleInvite} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
              required
            />
            <input
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
              required
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="h-10 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <Button type="submit" variant="primary" size="sm" isDisabled={submitting}>
              Send invite
            </Button>
          </form>
          {groups.length > 0 && (
            <GroupSelectChips
              groups={groups}
              selectedIds={groupIds}
              onToggle={toggleGroup}
            />
          )}
          {lastInviteUrl && (
            <div className="mt-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900">
              <p className="text-sm text-emerald-800 dark:text-emerald-300 mb-1">Invitation sent</p>
              <p className="text-xs text-emerald-700 dark:text-emerald-400 break-all font-mono">
                {lastInviteUrl}
              </p>
            </div>
          )}
          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        </CardContent>
      </Card>

      {invites.length > 0 && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Pending invitations
              </h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-zinc-500 dark:text-zinc-400">
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Expires</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((invite) => (
                  <tr
                    key={invite.userId}
                    className="border-b border-zinc-100 dark:border-zinc-800/80 last:border-0"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-zinc-900 dark:text-zinc-100">{invite.name}</div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">{invite.email}</div>
                    </td>
                    <td className="px-4 py-3 capitalize">{invite.role}</td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {new Date(invite.expiresAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onPress={() => {
                            void navigator.clipboard.writeText(invite.inviteUrl);
                          }}
                        >
                          Copy link
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onPress={() => resendInvite(invite.userId)}
                        >
                          Resend
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">All users</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-zinc-500 dark:text-zinc-400">
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Groups</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-zinc-100 dark:border-zinc-800/80 last:border-0"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-zinc-900 dark:text-zinc-100">{user.name}</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">{user.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={user.role}
                      onChange={(e) => changeRole(user, e.target.value as UserRole)}
                      disabled={user.status === "invited"}
                      className="h-8 px-2 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs disabled:opacity-50"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 min-w-[180px] max-w-[280px]">
                    {user.status === "deactivated" ? (
                      <span className="text-xs text-zinc-400">—</span>
                    ) : (
                      <UserGroupChips
                        groups={groups}
                        memberships={memberships}
                        userId={user.id}
                        disabled={busyUserId === user.id}
                        onToggle={(groupId, isMember) =>
                          toggleUserGroup(user.id, groupId, isMember)
                        }
                      />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Chip size="sm" variant="secondary" className="text-xs capitalize">
                      {user.status}
                    </Chip>
                  </td>
                  <td className="px-4 py-3">
                    {user.status === "invited" ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onPress={() => resendInvite(user.id)}
                      >
                        Resend invite
                      </Button>
                    ) : user.status !== "deactivated" ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onPress={() => deactivate(user)}
                      >
                        Deactivate
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
