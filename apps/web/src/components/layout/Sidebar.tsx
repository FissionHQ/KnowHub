"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import { spacesApi, activityApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Space, Document } from "@wiki/types";
import { Separator } from "@heroui/react";
import { LogOut, Search, Settings, User, Zap, ChevronRight, ChevronDown, Clock, Star, RefreshCw } from "lucide-react";
import clsx from "clsx";
import { ThemeToggle } from "./ThemeToggle";
import { SpaceDocTree } from "./SpaceDocTree";

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { data: spaces = [] } = useSWR<Space[]>(user ? "spaces" : null, spacesApi.list);
  const { data: recentDocs = [] } = useSWR<Document[]>(user ? "recent" : null, activityApi.getRecent);
  const { data: recentlyUpdated = [] } = useSWR<Document[]>(user ? "recently-updated" : null, activityApi.getRecentlyUpdated);
  const { data: favDocs = [] } = useSWR<Document[]>(user ? "favorites" : null, activityApi.getFavorites);

  const [showBookmarks, setShowBookmarks] = useState(true);
  const [showRecent, setShowRecent] = useState(false);

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
        {/* Spaces — always at top */}
        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest px-3 pt-2 pb-1">
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

        {/* Bookmarks — collapsible */}
        <button
          type="button"
          onClick={() => setShowBookmarks((v) => !v)}
          className="flex items-center gap-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest px-3 pt-4 pb-1 w-full text-left hover:text-zinc-400 transition-colors"
        >
          {showBookmarks ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          Bookmarks
          {favDocs.length > 0 && (
            <span className="ml-auto text-[9px] bg-white/10 text-zinc-500 px-1.5 py-0.5 rounded-full">{favDocs.length}</span>
          )}
        </button>
        {showBookmarks && (
          favDocs.length > 0 ? (
            <div className="flex flex-col gap-0.5 mb-1">
              {favDocs.slice(0, 5).map((doc) => (
                <Link key={doc.id} href={`/spaces/${doc.spaceId}/docs/${doc.id}`}>
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] text-zinc-300 hover:bg-white/10 transition-colors cursor-pointer truncate">
                    <Star size={11} className="text-amber-400 fill-amber-400 shrink-0" />
                    <span className="truncate">{doc.title}</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-zinc-600 px-3 py-1 mb-1">Click &quot;Bookmark&quot; on any page</p>
          )
        )}

        {/* Recent — collapsible */}
        {(recentDocs.length > 0 || recentlyUpdated.length > 0) && (
          <>
            <button
              type="button"
              onClick={() => setShowRecent((v) => !v)}
              className="flex items-center gap-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest px-3 pt-3 pb-1 w-full text-left hover:text-zinc-400 transition-colors"
            >
              {showRecent ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              Recent
            </button>
            {showRecent && (
              <div className="flex flex-col gap-0.5 mb-1">
                {recentDocs.slice(0, 4).map((doc) => (
                  <Link key={doc.id} href={`/spaces/${doc.spaceId}/docs/${doc.id}`}>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] text-zinc-300 hover:bg-white/10 transition-colors cursor-pointer truncate">
                      <Clock size={11} className="text-zinc-500 shrink-0" />
                      <span className="truncate">{doc.title}</span>
                    </div>
                  </Link>
                ))}
                {recentlyUpdated.slice(0, 3).map((doc) => (
                  <Link key={`upd-${doc.id}`} href={`/spaces/${doc.spaceId}/docs/${doc.id}`}>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] text-zinc-300 hover:bg-white/10 transition-colors cursor-pointer truncate">
                      <RefreshCw size={11} className="text-zinc-500 shrink-0" />
                      <span className="truncate">{doc.title}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
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
