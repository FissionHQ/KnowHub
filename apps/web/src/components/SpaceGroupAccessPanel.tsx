"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { groupsApi, spacesApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { AccessLevel, Group, Space, SpacePermissionRecord } from "@wiki/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/ToastProvider";
import { Users, X } from "lucide-react";

interface Props {
  space: Space;
}

export function SpaceGroupAccessPanel({ space }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [grantGroupId, setGrantGroupId] = useState("");
  const [grantLevel, setGrantLevel] = useState<AccessLevel>("view");
  const [busy, setBusy] = useState(false);

  const isAclManager = Boolean(
    user && (user.role === "admin" || space.createdBy === user.id),
  );

  const { data: groups = [] } = useSWR<Group[]>(
    open && isAclManager ? "groups" : null,
    groupsApi.list,
  );
  const { data: permissions = [], mutate: mutatePermissions } = useSWR<SpacePermissionRecord[]>(
    open && isAclManager ? `space-perms:${space.slug}` : null,
    () => spacesApi.getPermissions(space.slug),
  );

  const assignedIds = useMemo(
    () => new Set(permissions.map((p) => p.groupId)),
    [permissions],
  );
  const grantableGroups = useMemo(
    () => groups.filter((g) => !assignedIds.has(g.id)),
    [groups, assignedIds],
  );
  const selectedGrantId = grantGroupId || grantableGroups[0]?.id || "";

  if (!isAclManager) return null;

  async function handleGrant() {
    if (!selectedGrantId) return;
    setBusy(true);
    try {
      await spacesApi.grantPermission(space.id, {
        groupId: selectedGrantId,
        accessLevel: grantLevel,
      });
      setGrantGroupId("");
      await mutatePermissions();
      toast("Access granted", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to grant access", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(groupId: string, groupName: string) {
    if (!confirm(`Remove access for "${groupName}" from this space?`)) return;
    setBusy(true);
    try {
      await spacesApi.revokePermission(space.id, groupId);
      await mutatePermissions();
      toast(`Removed access for ${groupName}`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to remove access", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleChangeLevel(groupId: string, accessLevel: AccessLevel) {
    setBusy(true);
    try {
      await spacesApi.grantPermission(space.id, { groupId, accessLevel });
      await mutatePermissions();
      toast("Access level updated", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to update access", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6">
      {!open ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-1.5"
          onClick={() => setOpen(true)}
        >
          <Users size={14} />
          Manage space access
        </Button>
      ) : (
        <Card>
          <CardContent className="p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Space access</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Grant or remove access for any group, including Everyone.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Current access
              </p>
              {permissions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No groups have access. Only admins can see this space until you grant access.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {permissions.map((p) => (
                    <li
                      key={p.groupId}
                      className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg border border-border"
                    >
                      <span className="text-sm font-medium text-foreground truncate">
                        {p.groupName}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <Select
                          value={p.accessLevel}
                          onChange={(v) => void handleChangeLevel(p.groupId, v as AccessLevel)}
                          options={[
                            { value: "view", label: "View" },
                            { value: "edit", label: "Edit" },
                          ]}
                          disabled={busy}
                          className="h-8 w-24"
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleRevoke(p.groupId, p.groupName)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-40"
                          aria-label={`Remove ${p.groupName}`}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {grantableGroups.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Grant access
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Select
                    value={selectedGrantId}
                    onChange={setGrantGroupId}
                    options={grantableGroups.map((g) => ({
                      value: g.id,
                      label: g.isDefault ? `${g.name} (Everyone)` : g.name,
                    }))}
                    className="h-9 flex-1"
                  />
                  <Select
                    value={grantLevel}
                    onChange={(v) => setGrantLevel(v as AccessLevel)}
                    options={[
                      { value: "view", label: "View" },
                      { value: "edit", label: "Edit" },
                    ]}
                    className="h-9 w-full sm:w-28"
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy || !selectedGrantId}
                    onClick={() => void handleGrant()}
                  >
                    Grant
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
