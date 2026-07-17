"use client";

import useSWR from "swr";
import { spacesApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Space } from "@wiki/types";
import { SearchPanel } from "@/components/search/SearchPanel";

export function SearchView() {
  const { user } = useAuth();
  const { data: spaces = [] } = useSWR<Space[]>(
    user ? ["search:spaces", user.id] : null,
    spacesApi.list,
  );

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-1">Search</h1>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm">
          {spaces.length
            ? "Find pages and PDFs in your spaces"
            : "You do not have access to any spaces yet"}
        </p>
      </div>
      <SearchPanel />
    </div>
  );
}
