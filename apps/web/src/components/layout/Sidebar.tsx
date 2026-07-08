"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import { spacesApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Space } from "@wiki/types";
import { Separator } from "@heroui/react";
import { LogOut, Search, Settings, User, Zap } from "lucide-react";
import clsx from "clsx";
import { ThemeToggle } from "./ThemeToggle";

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { data: spaces = [] } = useSWR<Space[]>(user ? "spaces" : null, spacesApi.list);

  return (
    <aside
      className="fixed left-0 top-0 h-full flex flex-col bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 z-20"
      style={{ width: "var(--sidebar-width)" }}
    >
      <div className="px-4 py-4 flex items-center gap-2.5">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 shadow-sm">
          <Zap size={15} className="text-white" strokeWidth={2.5} />
        </div>
        <Link href="/spaces" className="font-bold text-[15px] text-zinc-900 dark:text-zinc-100 tracking-tight">
          FissionDocs
        </Link>
      </div>

      <Separator />

      <div className="px-3 pt-2 pb-1">
        <Link href="/search">
          <div
            className={clsx(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer",
              pathname === "/search"
                ? "bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 font-medium"
                : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800",
            )}
          >
            <Search size={14} />
            <span className="flex-1">Search</span>
            <span className="text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 px-1.5 py-0.5 rounded font-mono">⌘K</span>
          </div>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-1">
        <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest px-3 pt-3 pb-1">
          Spaces
        </p>
        <div className="flex flex-col gap-0.5">
          {spaces.map((space) => {
            const active = pathname.startsWith(`/spaces/${space.id}`);
            return (
              <Link key={space.id} href={`/spaces/${space.id}`}>
                <div
                  className={clsx(
                    "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer",
                    active
                      ? "bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 font-semibold"
                      : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800",
                  )}
                >
                  <span className="text-base leading-none">{space.iconEmoji ?? "📄"}</span>
                  <span className="truncate">{space.name}</span>
                </div>
              </Link>
            );
          })}
          {spaces.length === 0 && (
            <p className="text-xs text-zinc-400 dark:text-zinc-500 px-3 py-2">No spaces yet</p>
          )}
        </div>
      </nav>

      <Separator />

      <div className="px-3 py-3 flex flex-col gap-1">
        {user && (
          <div className="px-3 py-2 mb-1">
            <div className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <User size={14} className="text-zinc-400 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium truncate">{user.name}</p>
                <p className="text-xs text-zinc-400 truncate capitalize">{user.role}</p>
              </div>
            </div>
          </div>
        )}
        <ThemeToggle />
        {user?.role === "admin" && (
          <Link href="/admin">
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer">
              <Settings size={14} />
              <span>Admin</span>
            </div>
          </Link>
        )}
        <button
          type="button"
          onClick={() => logout()}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors w-full text-left"
        >
          <LogOut size={14} />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
