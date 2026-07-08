"use client";

import useSWR from "swr";
import Link from "next/link";
import { usersApi } from "@/lib/api";
import { Button, Card, CardContent, Skeleton } from "@heroui/react";
import { ShieldAlert } from "lucide-react";
import { UsersSection } from "./sections/UsersSection";
import { GroupsSection } from "./sections/GroupsSection";
import { SpacesSection } from "./sections/SpacesSection";
import { SettingsSection } from "./sections/SettingsSection";
import { AuditLogSection } from "./sections/AuditLogSection";
import clsx from "clsx";
import { useState } from "react";

const TABS = [
  { id: "settings", label: "Organization" },
  { id: "users", label: "Users" },
  { id: "groups", label: "Groups" },
  { id: "spaces", label: "Spaces" },
  { id: "audit", label: "Audit log" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function AdminView() {
  const [tab, setTab] = useState<TabId>("settings");
  const { data: me, isLoading, error } = useSWR("users:me", usersApi.me);

  if (isLoading) {
    return (
      <div className="p-8 max-w-5xl mx-auto space-y-4">
        <Skeleton className="w-48 h-8 rounded-lg" />
        <Skeleton className="w-full h-64 rounded-xl" />
      </div>
    );
  }

  if (error || !me || me.role !== "admin") {
    return (
      <div className="p-8 max-w-lg mx-auto mt-16">
        <Card className="border-amber-100 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30">
          <CardContent className="p-6 flex flex-col items-center gap-3 text-center">
            <ShieldAlert className="text-amber-600 dark:text-amber-400" size={32} />
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Admin access required
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              You need an admin account to manage organization settings, users, and spaces.
            </p>
            <Link href="/spaces">
              <Button variant="secondary" size="sm">
                Back to spaces
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Administration</h1>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
          Manage organization settings, users, groups, spaces, and audit history.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6 border-b border-zinc-200 dark:border-zinc-800 pb-3">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={clsx(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
              tab === item.id
                ? "bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300"
                : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "settings" && <SettingsSection />}
      {tab === "users" && <UsersSection />}
      {tab === "groups" && <GroupsSection />}
      {tab === "spaces" && <SpacesSection />}
      {tab === "audit" && <AuditLogSection />}
    </div>
  );
}
