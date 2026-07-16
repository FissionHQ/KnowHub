"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { searchApi, spacesApi } from "@/lib/api";
import type { SearchResponse } from "@wiki/types";
import { Button, Chip, Card, CardContent, Skeleton } from "@heroui/react";
import { Search, FileText, File, X, SlidersHorizontal } from "lucide-react";
import useSWR from "swr";

export function SearchView() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [spaceId, setSpaceId] = useState<string>("");
  const [type, setType] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Suggestions
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestTimeout = useRef<ReturnType<typeof setTimeout>>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: spaces } = useSWR("spaces", spacesApi.list);

  // Typeahead suggestions (SR-5)
  useEffect(() => {
    if (suggestTimeout.current) clearTimeout(suggestTimeout.current);
    if (query.trim().length < 2) { setSuggestions([]); return; }
    suggestTimeout.current = setTimeout(async () => {
      try {
        const s = await searchApi.suggest(query);
        setSuggestions(s);
        setShowSuggestions(s.length > 0);
      } catch { setSuggestions([]); }
    }, 200);
    return () => { if (suggestTimeout.current) clearTimeout(suggestTimeout.current); };
  }, [query]);

  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setSearched(true);
    setShowSuggestions(false);
    try {
      const params: Record<string, string | number | undefined> = { q };
      if (spaceId) params.spaceId = spaceId;
      if (type) params.type = type;
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;
      const res = await searchApi.search(params);
      setResults(res);
    } catch {
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, [spaceId, type, dateFrom, dateTo]);

  const selectSuggestion = (s: string) => {
    setQuery(s);
    setShowSuggestions(false);
    handleSearch(s);
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-1">Search</h1>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm">Find pages and PDFs across all your spaces</p>
      </div>

      {/* Search bar */}
      <form
        onSubmit={(e) => { e.preventDefault(); handleSearch(query); }}
        className="flex gap-2 mb-3"
      >
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
          />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="Search pages and PDFs…"
            className="w-full h-11 pl-9 pr-4 text-sm border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#f25011]/30 focus:border-[#f25011] transition-colors"
          />
          {/* Suggestions dropdown (SR-5) */}
          {showSuggestions && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg overflow-hidden">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="w-full text-left px-4 py-2.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                  onMouseDown={() => selectSuggestion(s)}
                >
                  <Search size={12} className="inline mr-2 text-zinc-400" />
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="md"
          onPress={() => setShowFilters(!showFilters)}
          className="h-11 px-3 border-zinc-200 dark:border-zinc-700"
        >
          <SlidersHorizontal size={16} />
        </Button>
        <Button
          type="submit"
          size="md"
          isDisabled={loading || !query.trim()}
          className="px-5 h-11 !bg-[#f25011] hover:!bg-[#e0470f] active:!bg-[#cf400d] !text-white transition-colors duration-200 cursor-pointer disabled:cursor-not-allowed"
        >
          {loading ? "Searching…" : "Search"}
        </Button>
      </form>

      {/* Filters panel (SR-3) */}
      {showFilters && (
        <div className="mb-6 p-4 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-zinc-50 dark:bg-zinc-900/50">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">Space</label>
              <select
                value={spaceId}
                onChange={(e) => setSpaceId(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
              >
                <option value="">All spaces</option>
                {spaces?.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
              >
                <option value="">All types</option>
                <option value="page">Page</option>
                <option value="pdf">PDF</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">From date</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">To date</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
              />
            </div>
          </div>
          {(spaceId || type || dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => { setSpaceId(""); setType(""); setDateFrom(""); setDateTo(""); }}
              className="mt-3 text-xs text-[#f25011] hover:underline flex items-center gap-1"
            >
              <X size={12} /> Clear filters
            </button>
          )}
        </div>
      )}

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
              <CardContent className="py-14 flex flex-col items-center gap-3 text-zinc-400 dark:text-zinc-500">
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
                        {hit.highlight.body?.[0] ? (
                          <p
                            className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2 leading-relaxed [&>mark]:bg-yellow-200 [&>mark]:dark:bg-yellow-800/50 [&>mark]:px-0.5 [&>mark]:rounded"
                            dangerouslySetInnerHTML={{ __html: hit.highlight.body[0] }}
                          />
                        ) : hit.preview ? (
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
                            {hit.preview}
                          </p>
                        ) : null}
                      </div>
                      <Chip
                        size="sm"
                        variant="soft"
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
