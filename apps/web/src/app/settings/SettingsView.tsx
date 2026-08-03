"use client";

import useSWR from "swr";
import Link from "next/link";
import { usersApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldAlert } from "lucide-react";
import { UsersSection } from "./sections/UsersSection";
import { GroupsSection } from "./sections/GroupsSection";
import { SpacesSection } from "./sections/SpacesSection";
import { SettingsSection } from "./sections/SettingsSection";
import { AuditLogSection } from "./sections/AuditLogSection";
import { TrashSection } from "./sections/TrashSection";
import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

const ALL_TABS = [
  { id: "settings", label: "Organization", adminOnly: true },
  { id: "users", label: "Users", adminOnly: true },
  { id: "groups", label: "Groups", adminOnly: false },
  { id: "spaces", label: "Spaces", adminOnly: false },
  { id: "trash", label: "Trash", adminOnly: true },
  { id: "audit", label: "Audit log", adminOnly: true },
] as const;

type TabId = (typeof ALL_TABS)[number]["id"];

function isTabId(value: string | null): value is TabId {
  return ALL_TABS.some((tab) => tab.id === value);
}

export function SettingsView() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const { data: me, isLoading, error } = useSWR("users:me", usersApi.me);

  const isAdmin = me?.role === "admin";
  const canManageGroups = Boolean(isAdmin || me?.canManageGroups);
  const canCreateSpaces = Boolean(isAdmin || me?.canCreateSpaces);
  const canAccessSettings = Boolean(isAdmin || canManageGroups || canCreateSpaces);

  const availableTabs = useMemo(() => {
    if (!me) return [] as typeof ALL_TABS[number][];
    return ALL_TABS.filter((tab) => {
      if (tab.adminOnly) return isAdmin;
      if (tab.id === "groups") return canManageGroups;
      if (tab.id === "spaces") return canCreateSpaces || isAdmin;
      return true;
    });
  }, [me, isAdmin, canManageGroups, canCreateSpaces]);

  const [tab, setTab] = useState<TabId | null>(
    isTabId(initialTab) ? initialTab : null,
  );

  useEffect(() => {
    if (!availableTabs.length) return;
    if (tab && availableTabs.some((item) => item.id === tab)) return;
    const fromQuery = isTabId(initialTab)
      ? availableTabs.find((item) => item.id === initialTab)
      : undefined;
    setTab(fromQuery?.id ?? availableTabs[0]!.id);
  }, [availableTabs, tab, initialTab]);

  if (isLoading) {
    return (
      <div className="p-8 max-w-8xl mx-auto space-y-4">
        <Skeleton className="w-48 h-8 rounded-lg" />
        <Skeleton className="w-full h-64 rounded-xl" />
      </div>
    );
  }

  if (error || !me || !canAccessSettings) {
    return (
      <div className="p-8 max-w-lg mx-auto mt-16">
        <Card className="border-amber-100 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30">
          <CardContent className="p-6 flex flex-col items-center gap-3 text-center">
            <ShieldAlert className="text-amber-600 dark:text-amber-400" size={32} />
            <h1 className="text-lg font-semibold text-foreground">
              Settings access required
            </h1>
            <p className="text-sm text-muted-foreground">
              You need permission to manage spaces or groups, or an admin account, to open Settings.
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
    <div className="p-8 max-w-8xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {isAdmin
            ? "Manage organization settings, users, groups, spaces, trash, and audit history."
            : "Manage the spaces and groups you own."}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6 border-b border-border pb-3">
        {availableTabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={clsx(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
              tab === item.id
                ? "bg-orange-50 dark:bg-orange-950/30 text-primary"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "settings" && isAdmin && <SettingsSection />}
      {tab === "users" && isAdmin && <UsersSection />}
      {tab === "groups" && canManageGroups && <GroupsSection />}
      {tab === "spaces" && (canCreateSpaces || isAdmin) && <SpacesSection />}
      {tab === "trash" && isAdmin && <TrashSection />}
      {tab === "audit" && isAdmin && <AuditLogSection />}
    </div>
  );
}
