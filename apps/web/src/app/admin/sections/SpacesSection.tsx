"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { groupsApi, spacesApi } from "@/lib/api";
import type { AccessLevel } from "@wiki/types";
import { Button, Card, CardContent } from "@heroui/react";

export function SpacesSection() {
  const { data: spaces = [], mutate } = useSWR("admin:spaces", spacesApi.list);
  const { data: groups = [] } = useSWR("admin:groups", groupsApi.list);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [iconEmoji, setIconEmoji] = useState("📄");
  const [groupId, setGroupId] = useState("");
  const [accessLevel, setAccessLevel] = useState<AccessLevel>("edit");
  const [submitting, setSubmitting] = useState(false);

  const defaultGroupId = groupId || groups[0]?.id || "";

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
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
            Create space
          </h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              placeholder="Space name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
              required
            />
            <input
              placeholder="Icon emoji"
              value={iconEmoji}
              onChange={(e) => setIconEmoji(e.target.value)}
              className="h-10 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
              maxLength={4}
            />
            <input
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-10 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm md:col-span-2"
            />
            <select
              value={defaultGroupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="h-10 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
            >
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
            <select
              value={accessLevel}
              onChange={(e) => setAccessLevel(e.target.value as AccessLevel)}
              className="h-10 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
            >
              <option value="view">View access</option>
              <option value="edit">Edit access</option>
            </select>
            <div className="md:col-span-2">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isDisabled={submitting || !defaultGroupId}
              >
                Create space
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 divide-y divide-zinc-100 dark:divide-zinc-800">
          {spaces.map((space) => (
            <div key={space.id} className="px-4 py-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-2xl">{space.iconEmoji ?? "📄"}</span>
                <div className="min-w-0">
                  <Link
                    href={`/spaces/${space.id}`}
                    className="font-medium text-zinc-900 dark:text-zinc-100 hover:text-violet-600 dark:hover:text-violet-400"
                  >
                    {space.name}
                  </Link>
                  {space.description && (
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 truncate">
                      {space.description}
                    </p>
                  )}
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onPress={() => handleDelete(space.id, space.name)}
              >
                Delete
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
