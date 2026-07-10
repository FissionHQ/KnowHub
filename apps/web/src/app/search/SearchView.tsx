"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { searchApi } from "@/lib/api";
import type { SearchResponse } from "@wiki/types";
import { Button, Chip, Card, CardContent, Skeleton } from "@heroui/react";
import { Search, FileText, File } from "lucide-react";

export function SearchView() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await searchApi.search({ q });
      setResults(res);
    } catch {
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-1">Search</h1>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm">Find pages and PDFs across all your spaces</p>
      </div>

      {/* Search bar */}
      <form
        onSubmit={(e) => { e.preventDefault(); handleSearch(query); }}
        className="flex gap-2 mb-8"
      >
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages and PDFs…"
            className="w-full h-11 pl-9 pr-4 text-sm border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#f25011]/30 focus:border-[#f25011] transition-colors"
          />
        </div>
        <Button
          type="submit"
          variant="primary"
          size="md"
          isDisabled={loading || !query.trim()}
          className="px-5 h-11 !bg-[#f25011] hover:!bg-[#e0470f] active:!bg-[#cf400d] !text-white transition-colors duration-200 cursor-pointer disabled:cursor-not-allowed"
        >
          {loading ? "Searching…" : "Search"}
        </Button>
      </form>

      {/* Loading skeletons */}
      {loading && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="w-full h-20 rounded-xl" />
          ))}
        </div>
      )}

      {/* Results */}
      {!loading && results && (
        <div>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-4 font-medium">
            {results.total} result{results.total !== 1 ? "s" : ""} for &ldquo;{query}&rdquo;
          </p>

          {results.hits.length === 0 ? (
            <Card>
              <CardContent className="py-14 flex flex-col items-center gap-3 text-zinc-400 dark:text-zinc-500 p-5">
                <Search size={32} className="opacity-30" />
                <p className="text-sm">No results found for &ldquo;{query}&rdquo;</p>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-2">
              {results.hits.map((hit) => (
                <button
                  key={hit.documentId}
                  type="button"
                  className="group text-left w-full"
                  onClick={() => router.push(`/spaces/${hit.spaceId}/docs/${hit.documentId}`)}
                >
                  <Card className="transition-all hover:shadow-sm hover:border-[#f25011]/30 cursor-pointer">
                    <CardContent className="flex flex-row items-start gap-3 p-4">
                      <div
                        className={
                          hit.type === "pdf"
                            ? "p-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-500 shrink-0 mt-0.5"
                            : "p-2 rounded-lg bg-orange-50 dark:bg-orange-950/40 text-[#f25011] shrink-0 mt-0.5"
                        }
                      >
                        {hit.type === "pdf" ? <File size={15} /> : <FileText size={15} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm group-hover:text-[#f25011] transition-colors"
                          dangerouslySetInnerHTML={{
                            __html: hit.highlight.title?.[0] ?? hit.title,
                          }}
                        />
                        {hit.highlight.body?.[0] && (
                          <p
                            className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2 leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: hit.highlight.body[0] }}
                          />
                        )}
                      </div>
                      <Chip
                        size="sm"
                        variant="secondary"
                        color={hit.type === "pdf" ? "danger" : "default"}
                        className="text-xs shrink-0"
                      >
                        {hit.type.toUpperCase()}
                      </Chip>
                    </CardContent>
                  </Card>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state before first search */}
      {!loading && !searched && (
        <div className="flex flex-col items-center gap-3 py-20 text-zinc-300 dark:text-zinc-600">
          <Search size={48} strokeWidth={1} />
          <p className="text-sm text-zinc-400 dark:text-zinc-500">Type something to search</p>
        </div>
      )}
    </div>
  );
}
