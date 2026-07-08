"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import type { Group, GroupMembershipEntry, User } from "@wiki/types";
import clsx from "clsx";
import { ChevronDown, Search, X } from "lucide-react";

const MAX_INLINE_CHIPS = 3;

interface Props {
  groups: Group[];
  memberships: GroupMembershipEntry[];
  userId: string;
  disabled?: boolean;
  onToggle: (groupId: string, isMember: boolean) => Promise<void>;
}

export function UserGroupChips({
  groups,
  memberships,
  userId,
  disabled,
  onToggle,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  const memberGroupIds = useMemo(
    () =>
      new Set(
        memberships.filter((m) => m.userId === userId).map((m) => m.groupId),
      ),
    [memberships, userId],
  );

  const memberGroups = useMemo(
    () => groups.filter((g) => memberGroupIds.has(g.id)),
    [groups, memberGroupIds],
  );

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.description?.toLowerCase().includes(q),
    );
  }, [groups, query]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  if (!groups.length) {
    return <span className="text-xs text-zinc-400">No groups</span>;
  }

  const inlineGroups = memberGroups.slice(0, MAX_INLINE_CHIPS);
  const overflowCount = memberGroups.length - inlineGroups.length;

  return (
    <div className="relative" ref={panelRef}>
      <div className="flex flex-wrap items-center gap-1.5">
        {inlineGroups.map((group) => (
          <span
            key={group.id}
            className="px-2 py-0.5 rounded-full text-xs border border-violet-400 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 truncate max-w-[120px]"
            title={group.name}
          >
            {group.name}
          </span>
        ))}
        {overflowCount > 0 && (
          <span className="px-2 py-0.5 rounded-full text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
            +{overflowCount}
          </span>
        )}
        {memberGroups.length === 0 && (
          <span className="text-xs text-zinc-400">None</span>
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          className={clsx(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors",
            "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400",
            "hover:border-violet-300 hover:text-violet-700 dark:hover:text-violet-300",
            disabled && "opacity-50 cursor-not-allowed",
          )}
        >
          Manage
          <ChevronDown size={12} className={clsx(open && "rotate-180")} />
        </button>
      </div>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 w-64 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg">
          <div className="p-2 border-b border-zinc-100 dark:border-zinc-800">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
              />
              <input
                type="search"
                placeholder="Search groups…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full h-8 pl-8 pr-8 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-xs"
                autoFocus
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                  aria-label="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
          <ul className="max-h-52 overflow-y-auto py-1">
            {filteredGroups.length === 0 ? (
              <li className="px-3 py-2 text-xs text-zinc-400">No groups match</li>
            ) : (
              filteredGroups.map((group) => {
                const isMember = memberGroupIds.has(group.id);
                return (
                  <li key={group.id}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onToggle(group.id, isMember)}
                      className={clsx(
                        "w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors",
                        "hover:bg-zinc-50 dark:hover:bg-zinc-800/80",
                        disabled && "opacity-50",
                      )}
                    >
                      <span className="truncate font-medium text-zinc-800 dark:text-zinc-200">
                        {group.name}
                      </span>
                      <span
                        className={clsx(
                          "shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide",
                          isMember
                            ? "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300"
                            : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
                        )}
                      >
                        {isMember ? "In" : "Add"}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          <div className="px-3 py-2 border-t border-zinc-100 dark:border-zinc-800 text-[10px] text-zinc-400">
            {memberGroups.length} of {groups.length} groups
          </div>
        </div>
      )}
    </div>
  );
}

export function membersForGroup(
  memberships: GroupMembershipEntry[],
  groupId: string,
): GroupMembershipEntry[] {
  return memberships.filter((m) => m.groupId === groupId);
}

export function usersNotInGroup(
  users: User[],
  memberships: GroupMembershipEntry[],
  groupId: string,
): User[] {
  const memberIds = new Set(
    memberships.filter((m) => m.groupId === groupId).map((m) => m.userId),
  );
  return users.filter((u) => u.status !== "deactivated" && !memberIds.has(u.id));
}

/** Compact chips for invite form — wraps but stays lightweight for selection */
export function GroupSelectChips({
  groups,
  selectedIds,
  onToggle,
}: {
  groups: Group[];
  selectedIds: string[];
  onToggle: (groupId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const selected = new Set(selectedIds);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [groups, query]);

  if (!groups.length) return null;

  return (
    <div className="mt-4 space-y-2">
      {groups.length > 8 && (
        <input
          type="search"
          placeholder="Filter groups…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs w-full max-w-xs"
        />
      )}
      <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
        {filtered.map((group) => (
          <button
            key={group.id}
            type="button"
            onClick={() => onToggle(group.id)}
            className={clsx(
              "px-2.5 py-1 rounded-full text-xs border transition-colors",
              selected.has(group.id)
                ? "border-violet-400 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300"
                : "border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300",
            )}
          >
            {group.name}
          </button>
        ))}
      </div>
    </div>
  );
}
