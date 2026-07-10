"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import { spacesApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Space } from "@wiki/types";
import { Separator } from "@heroui/react";
import { LogOut, Search, Settings, User, Zap, ChevronRight } from "lucide-react";
import clsx from "clsx";
import { ThemeToggle } from "./ThemeToggle";
import { SpaceDocTree } from "./SpaceDocTree";

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { data: spaces = [] } = useSWR<Space[]>(user ? "spaces" : null, spacesApi.list);

  // Detect active space from URL: /spaces/:spaceId/...
  const spaceMatch = pathname.match(/^\/spaces\/([^/]+)/);
  const activeSpaceId = spaceMatch?.[1] ?? null;

  return (
    <aside
      className="fixed left-0 top-0 h-full flex flex-col border-r border-zinc-200 dark:border-zinc-800 z-20"
      style={{ width: "var(--sidebar-width)", backgroundColor: "rgb(28, 30, 46)" }}
    >
      <div className="px-4 py-4 flex items-center gap-2.5">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#f25011] shadow-sm">
          <Zap size={15} color="white" strokeWidth={2.5} />
        </div>
        <Link href="/spaces" className="font-bold text-[15px] tracking-tight" style={{ color: "white" }}>
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
                ? "font-medium"
                : "text-zinc-400 hover:bg-white/10",
            )}
            style={pathname === "/search" ? { color: "#f25011" } : {}}
          >
            <Search size={14} />
            <span className="flex-1">Search</span>
            <span className="text-xs bg-white/10 text-zinc-400 px-1.5 py-0.5 rounded font-mono">⌘K</span>
          </div>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-1">
        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest px-3 pt-3 pb-1">
          Spaces
        </p>
        <div className="flex flex-col gap-0.5">
          {spaces.map((space) => {
            const isActive = activeSpaceId === space.id;
            return (
              <div key={space.id}>
                <Link href={`/spaces/${space.id}`}>
                  <div
                    className={clsx(
                      "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer",
                      isActive
                        ? "font-semibold"
                        : "text-zinc-300 hover:bg-white/10",
                    )}
                    style={isActive ? { color: "#f25011" } : {}}
                  >
                    <span className="text-base leading-none">{space.iconEmoji ?? "📄"}</span>
                    <span className="truncate flex-1">{space.name}</span>
                    {isActive && <ChevronRight size={12} className="opacity-40" />}
                  </div>
                </Link>

                {/* Doc tree — only for the active space */}
                {isActive && <SpaceDocTree spaceId={space.id} />}
              </div>
            );
          })}
          {spaces.length === 0 && (
            <p className="text-xs text-zinc-500 px-3 py-2">No spaces yet</p>
          )}
        </div>
      </nav>

      <Separator />

      <div className="px-3 py-3 flex flex-col gap-1">
        {user && (
          <div className="px-3 py-2 mb-1">
            <div className="flex items-center gap-2 text-sm text-zinc-300">
              <User size={14} className="text-zinc-500 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium truncate">{user.name}</p>
                <p className="text-xs text-zinc-500 truncate capitalize">{user.role}</p>
              </div>
            </div>
          </div>
        )}
        <ThemeToggle />
        {user?.role === "admin" && (
          <Link href="/admin">
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:bg-white/10 transition-colors cursor-pointer">
              <Settings size={14} />
              <span>Admin</span>
            </div>
          </Link>
        )}
        <button
          type="button"
          onClick={() => logout()}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:bg-white/10 transition-colors w-full text-left"
        >
          <LogOut size={14} />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
