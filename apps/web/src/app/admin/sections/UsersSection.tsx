"use client";

import { useState } from "react";
import useSWR from "swr";
import { groupsApi, usersApi } from "@/lib/api";
import { UserGroupChips, GroupSelectChips } from "@/components/admin/GroupMembershipChips";
import type { User, UserRole } from "@wiki/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/Select";

const ROLES: UserRole[] = ["admin", "member", "viewer"];

/** Prefer the host the admin is browsing; API APP_URL may still be localhost. */
function publicInviteUrl(apiInviteUrl: string): string {
  try {
    const path = new URL(apiInviteUrl).pathname;
    return `${window.location.origin}${path}`;
  } catch {
    return apiInviteUrl;
  }
}

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
    const group = groups.find((g) => g.id === groupId);
    if (isMember && group?.isDefault) return;

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
      setLastInviteUrl(publicInviteUrl(result.inviteUrl));
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
    setLastInviteUrl(publicInviteUrl(result.inviteUrl));
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
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Invite user
          </h2>
          <form onSubmit={handleInvite} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 px-3 rounded-lg border border-border bg-card text-sm"
              required
            />
            <input
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10 px-3 rounded-lg border border-border bg-card text-sm"
              required
            />
            <Select
              value={role}
              onChange={(v) => setRole(v as UserRole)}
              options={ROLES.map((r) => ({ value: r, label: r }))}
              className="h-10"
            />
            <Button type="submit" variant="default" size="sm" disabled={submitting}>
              Send invite
            </Button>
          </form>
          {groups.length > 0 && (
            <>
              <p className="mt-3 text-xs text-muted-foreground">
                Everyone (default) is always included. Optionally add more groups below.
              </p>
              <GroupSelectChips
                groups={groups.filter((g) => !g.isDefault)}
                selectedIds={groupIds}
                onToggle={toggleGroup}
              />
            </>
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
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">
                Pending invitations
              </h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
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
                    className="border-b border-border/80 last:border-0"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{invite.name}</div>
                      <div className="text-xs text-muted-foreground">{invite.email}</div>
                    </td>
                    <td className="px-4 py-3 capitalize">{invite.role}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(invite.expiresAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            void navigator.clipboard.writeText(publicInviteUrl(invite.inviteUrl));
                          }}
                        >
                          Copy link
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => resendInvite(invite.userId)}
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
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">All users</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
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
                  className="border-b border-border/80 last:border-0"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{user.name}</div>
                    <div className="text-xs text-muted-foreground">{user.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      value={user.role}
                      onChange={(v) => changeRole(user, v as UserRole)}
                      options={ROLES.map((r) => ({ value: r, label: r }))}
                      disabled={user.status === "invited"}
                      className="h-8 w-28"
                    />
                  </td>
                  <td className="px-4 py-3 min-w-[180px] max-w-[280px]">
                    {user.status === "deactivated" ? (
                      <span className="text-xs text-muted-foreground">—</span>
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
                    <Badge variant="secondary" className="text-xs capitalize">
                      {user.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {user.status === "invited" ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => resendInvite(user.id)}
                      >
                        Resend invite
                      </Button>
                    ) : user.status !== "deactivated" ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => deactivate(user)}
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
