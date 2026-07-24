"use client";

import { useState } from "react";
import { SearchPanel } from "@/components/search/SearchPanel";

export function SearchView() {
  const [searched, setSearched] = useState(false);

  return (
    <div
      className={`transition-all duration-500 ease-in-out ${
        searched
          ? "pt-8 w-full"
          : "flex-1 flex flex-col items-center justify-center pb-24 w-full"
      }`}
    >
      {!searched && (
        <div className="flex flex-col items-center gap-3 mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Search KnowHub
          </h1>
        </div>
      )}

      {searched && (
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-6">
          Search
        </h1>
      )}

      <div className={searched ? "w-full" : "w-full max-w-2xl"}>
        <SearchPanel onSearchedChange={setSearched} />
      </div>
    </div>
  );
}
