"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { groupsApi, spacesApi } from "@/lib/api";
import type { AccessLevel, Space, SpacePermissionRecord } from "@wiki/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Users } from "lucide-react";
import { Select } from "@/components/ui/Select";

export function SpacesSection() {
  const { data: spaces = [], mutate } = useSWR("admin:spaces", spacesApi.list);
  const { data: groups = [] } = useSWR("admin:groups", groupsApi.list);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [iconEmoji, setIconEmoji] = useState("📄");
  const [groupId, setGroupId] = useState("");
  const [accessLevel, setAccessLevel] = useState<AccessLevel>("view");
  const [submitting, setSubmitting] = useState(false);

  const defaultGroup = groups.find((g) => g.isDefault) ?? groups[0];
  const defaultGroupId = groupId || defaultGroup?.id || "";

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!defaultGroupId) return;
    setSubmitting(true);
    try {
      await spacesApi.create({
        name,
        iconEmoji,
        ...(description ? { description } : {}),
        groupPermissions: [{ groupId: defaultGroupId, accessLevel }],
      });
      setName("");
      setDescription("");
      setIconEmoji("📄");
      await mutate();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(spaceId: string, spaceName: string) {
    if (!confirm(`Delete space "${spaceName}"? This removes all documents in it.`)) return;
    await spacesApi.delete(spaceId);
    await mutate();
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Create space
          </h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              placeholder="Space name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10 px-3 rounded-lg border border-border bg-card text-sm"
              required
            />
            <input
              placeholder="Icon emoji"
              value={iconEmoji}
              onChange={(e) => setIconEmoji(e.target.value)}
              className="h-10 px-3 rounded-lg border border-border bg-card text-sm"
              maxLength={4}
            />
            <input
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-10 px-3 rounded-lg border border-border bg-card text-sm md:col-span-2"
            />
            <Select
              value={defaultGroupId}
              onChange={setGroupId}
              options={groups.map((g) => ({ value: g.id, label: g.name }))}
              className="h-10"
            />
            <Select
              value={accessLevel}
              onChange={(v) => setAccessLevel(v as AccessLevel)}
              options={[{ value: "view", label: "View access" }, { value: "edit", label: "Edit access" }]}
              className="h-10"
            />
            <div className="md:col-span-2">
              <Button
                type="submit"
                variant="default"
                size="sm"
                disabled={submitting || !defaultGroupId}
              >
                Create space
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 divide-y divide-border">
          {spaces.map((space) => (
            <SpaceRow
              key={space.id}
              space={space}
              groups={groups}
              onDelete={() => handleDelete(space.id, space.name)}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function SpaceRow({
  space,
  groups,
  onDelete,
}: {
  space: Space;
  groups: Array<{ id: string; name: string }>;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<SpacePermissionRecord[] | null>(null);
  const [addGroupId, setAddGroupId] = useState("");
  const [addAccessLevel, setAddAccessLevel] = useState<AccessLevel>("view");
  const [saving, setSaving] = useState(false);

  const { data: permissions = [], mutate } = useSWR(
    expanded ? `admin:space-perms:${space.id}` : null,
    () => spacesApi.getPermissions(space.id),
  );

  const activePermissions = draft ?? permissions;
  const assignedGroupIds = new Set(activePermissions.map((p) => p.groupId));
  const availableGroups = groups.filter((g) => !assignedGroupIds.has(g.id));
  const selectedAddGroupId = addGroupId || availableGroups[0]?.id || "";

  function beginEdit() {
    setExpanded(true);
    setDraft(null);
  }

  function updateDraft(
    updater: (current: SpacePermissionRecord[]) => SpacePermissionRecord[],
  ) {
    setDraft(updater(draft ?? permissions));
  }

  async function handleSave() {
    if (!activePermissions.length) {
      if (!confirm("Remove all group access from this space? Members will lose visibility.")) {
        return;
      }
    }
    setSaving(true);
    try {
      await spacesApi.updatePermissions(space.id, {
        groupPermissions: activePermissions.map((p) => ({
          groupId: p.groupId,
          accessLevel: p.accessLevel,
        })),
      });
      setDraft(null);
      await mutate();
    } finally {
      setSaving(false);
    }
  }

  function handleAddGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAddGroupId) return;
    const group = groups.find((g) => g.id === selectedAddGroupId);
    if (!group) return;
    updateDraft((current) => [
      ...current,
      {
        groupId: group.id,
        groupName: group.name,
        accessLevel: addAccessLevel,
      },
    ]);
    setAddGroupId("");
  }

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <Link
              href={`/spaces/${space.slug}`}
              className="font-medium text-foreground hover:text-primary dark:hover:text-primary"
            >
              {space.name}
            </Link>
            {space.description && (
              <p className="text-sm text-muted-foreground truncate">
                {space.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => (expanded ? setExpanded(false) : beginEdit())}
          >
            {expanded ? "Close" : "Manage access"}
          </Button>
          <Button variant="secondary" size="sm" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pl-11 space-y-4">
          {activePermissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No groups assigned. Add a group to grant access.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {activePermissions.map((perm) => (
                <li
                  key={perm.groupId}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 bg-card text-sm"
                >
                  <span className="inline-flex items-center gap-2 text-foreground/80 min-w-0 truncate">
                    <Users size={14} className="text-muted-foreground shrink-0" />
                    {perm.groupName}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <Select
                      value={perm.accessLevel}
                      onChange={(v) =>
                        updateDraft((current) =>
                          current.map((row) =>
                            row.groupId === perm.groupId
                              ? { ...row, accessLevel: v as AccessLevel }
                              : row,
                          ),
                        )
                      }
                      options={[{ value: "view", label: "View" }, { value: "edit", label: "Edit" }]}
                      className="h-8 w-28"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        updateDraft((current) =>
                          current.filter((row) => row.groupId !== perm.groupId),
                        )
                      }
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {availableGroups.length > 0 && (
            <form onSubmit={handleAddGroup} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Select
                value={selectedAddGroupId}
                onChange={setAddGroupId}
                options={availableGroups.map((g) => ({ value: g.id, label: g.name }))}
                className="h-9"
              />
              <Select
                value={addAccessLevel}
                onChange={(v) => setAddAccessLevel(v as AccessLevel)}
                options={[{ value: "view", label: "View access" }, { value: "edit", label: "Edit access" }]}
                className="h-9"
              />
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                disabled={!selectedAddGroupId}
              >
                Add group
              </Button>
            </form>
          )}

          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              disabled={saving || draft === null}
              onClick={handleSave}
            >
              {saving ? "Saving…" : "Save access"}
            </Button>
            {draft !== null && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDraft(null)}
              >
                Reset
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
