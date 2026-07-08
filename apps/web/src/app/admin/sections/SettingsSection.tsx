"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { adminApi } from "@/lib/api";
import { Button, Card, CardContent } from "@heroui/react";

export function SettingsSection() {
  const { data: org, mutate, isLoading } = useSWR("admin:settings", adminApi.getSettings);
  const [name, setName] = useState("");
  const [maxFileSizeMb, setMaxFileSizeMb] = useState("");
  const [trashRetentionDays, setTrashRetentionDays] = useState("");
  const [primaryColor, setPrimaryColor] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!org) return;
    setName(org.name);
    setMaxFileSizeMb(String(Math.round(org.maxFileSizeBytes / 1_048_576)));
    setTrashRetentionDays(String(org.trashRetentionDays));
    setPrimaryColor(org.branding?.primaryColor ?? "");
  }, [org]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await adminApi.updateSettings({
        name,
        maxFileSizeBytes: Number(maxFileSizeMb) * 1_048_576,
        trashRetentionDays: Number(trashRetentionDays),
        branding: primaryColor ? { primaryColor } : {},
      });
      await mutate();
      setMessage("Settings saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) return null;

  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
          Organization settings
        </h2>
        <form onSubmit={handleSave} className="flex flex-col gap-4 max-w-lg">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">Organization name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
              required
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">Max upload size (MB)</span>
            <input
              type="number"
              min={1}
              max={500}
              value={maxFileSizeMb}
              onChange={(e) => setMaxFileSizeMb(e.target.value)}
              className="h-10 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
              required
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">Trash retention (days)</span>
            <input
              type="number"
              min={1}
              max={365}
              value={trashRetentionDays}
              onChange={(e) => setTrashRetentionDays(e.target.value)}
              className="h-10 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
              required
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">Primary color (hex)</span>
            <input
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              placeholder="#7c3aed"
              pattern="^#[0-9a-fA-F]{6}$"
              className="h-10 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
            />
          </label>
          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" variant="primary" size="sm" isDisabled={saving}>
              {saving ? "Saving…" : "Save settings"}
            </Button>
            {message && (
              <span className="text-sm text-zinc-500 dark:text-zinc-400">{message}</span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
