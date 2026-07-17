"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { searchApi, spacesApi, usersApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { SearchResponse, Space, User } from "@wiki/types";
import { Button, Chip, Card, CardContent, Skeleton } from "@heroui/react";
import { Search, FileText, File, X, SlidersHorizontal } from "lucide-react";
import useSWR from "swr";

export interface SearchPanelProps {
  /** When set, search is scoped to this space and the space filter is hidden. */
  lockedSpaceId?: string;
  placeholder?: string;
  onSearchedChange?: (searched: boolean) => void;
}

export function SearchPanel({
  lockedSpaceId,
  placeholder = "Search pages and PDFs…",
  onSearchedChange,
}: SearchPanelProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const [spaceId, setSpaceId] = useState("");
  const [authorId, setAuthorId] = useState("");
  const [tags, setTags] = useState("");
  const [type, setType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestTimeout = useRef<ReturnType<typeof setTimeout>>(null);
  const filterSearchTimeout = useRef<ReturnType<typeof setTimeout>>(null);
  const queryRef = useRef(query);
  const runSearchRef = useRef<((q: string) => Promise<void>) | null>(null);
  const onSearchedChangeRef = useRef(onSearchedChange);
  queryRef.current = query;
  onSearchedChangeRef.current = onSearchedChange;

  const effectiveSpaceId = lockedSpaceId ?? spaceId;

  const { data: spaces = [] } = useSWR<Space[]>(
    user && !lockedSpaceId ? ["search:spaces", user.id] : null,
    spacesApi.list,
  );

  const { data: authors = [] } = useSWR<User[]>(
    user ? ["search:authors", user.orgId] : null,
    usersApi.list,
  );

  const orgAuthors = useMemo(
    () =>
      authors.filter(
        (u) => u.orgId === user?.orgId && u.status !== "deactivated",
      ),
    [authors, user?.orgId],
  );

  const hasTextQuery = Boolean(query.trim());
  const hasExtraFilters = Boolean(authorId || tags.trim() || type || dateFrom || dateTo);
  const hasSpacePickerFilter = Boolean(!lockedSpaceId && spaceId);
  const canSearch = hasTextQuery || hasExtraFilters || hasSpacePickerFilter;

  const hasActiveFilters = Boolean(
    hasExtraFilters || hasSpacePickerFilter,
  );

  useEffect(() => {
    if (!lockedSpaceId && spaceId && !spaces.some((s) => s.id === spaceId)) {
      setSpaceId("");
    }
  }, [spaces, spaceId, lockedSpaceId]);

  useEffect(() => {
    if (authorId && !orgAuthors.some((u) => u.id === authorId)) {
      setAuthorId("");
    }
  }, [orgAuthors, authorId]);

  useEffect(() => {
    onSearchedChangeRef.current?.(searched);
  }, [searched]);

  useEffect(() => {
    if (suggestTimeout.current) clearTimeout(suggestTimeout.current);
    if (query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    suggestTimeout.current = setTimeout(async () => {
      try {
        const s = await searchApi.suggest(query, effectiveSpaceId || undefined);
        setSuggestions(s);
        setShowSuggestions(s.length > 0);
      } catch {
        setSuggestions([]);
      }
    }, 200);
    return () => {
      if (suggestTimeout.current) clearTimeout(suggestTimeout.current);
    };
  }, [query, effectiveSpaceId]);

  const runSearch = useCallback(
    async (q: string) => {
      if (!canSearch && !q.trim()) return;

      setLoading(true);
      setSearched(true);
      setShowSuggestions(false);
      try {
        const params: Record<string, string | number | undefined> = {
          q: q.trim(),
        };
        if (effectiveSpaceId) params.spaceId = effectiveSpaceId;
        if (authorId) params.authorId = authorId;
        const tagList = tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        if (tagList.length) params.tags = tagList.join(",");
        if (type) params.type = type;
        if (dateFrom) params.from = dateFrom;
        if (dateTo) params.to = dateTo;
        const res = await searchApi.search(params);
        setResults(res);
      } catch {
        setResults({ hits: [], total: 0, page: 1, size: 20 });
      } finally {
        setLoading(false);
      }
    },
    [effectiveSpaceId, authorId, tags, type, dateFrom, dateTo, canSearch],
  );

  runSearchRef.current = runSearch;

  const filterKey = [
    authorId,
    tags,
    type,
    dateFrom,
    dateTo,
    spaceId,
    lockedSpaceId ?? "",
  ].join("\0");

  const searchDebounceKey = `${filterKey}\0${query.trim()}`;

  // Debounced search when query or filters change (keeps results in sync with suggestions).
  useEffect(() => {
    if (!canSearch) {
      setSearched(false);
      setResults(null);
      return;
    }
    if (filterSearchTimeout.current) clearTimeout(filterSearchTimeout.current);
    filterSearchTimeout.current = setTimeout(() => {
      void runSearchRef.current?.(queryRef.current);
    }, 350);
    return () => {
      if (filterSearchTimeout.current) clearTimeout(filterSearchTimeout.current);
    };
  }, [searchDebounceKey, canSearch]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (!value.trim() && !hasActiveFilters) {
      setResults(null);
      setSearched(false);
      setShowSuggestions(false);
      setSuggestions([]);
    }
  };

  const clearFilters = () => {
    if (!lockedSpaceId) setSpaceId("");
    setAuthorId("");
    setTags("");
    setType("");
    setDateFrom("");
    setDateTo("");
  };

  const selectSuggestion = (s: string) => {
    setQuery(s);
    setShowSuggestions(false);
    void runSearch(s);
  };

  const resultsLabel = hasTextQuery
    ? `${results?.total ?? 0} result${results?.total !== 1 ? "s" : ""} for “${query}”`
    : `${results?.total ?? 0} result${results?.total !== 1 ? "s" : ""}`;

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSearch) void runSearch(query);
        }}
        className="flex gap-2 mb-3"
      >
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder={placeholder}
            className="w-full h-11 pl-9 pr-4 text-sm border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#f25011]/30 focus:border-[#f25011] transition-colors"
          />
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
          className={`h-11 px-3 border-zinc-200 dark:border-zinc-700 relative ${
            hasActiveFilters ? "border-[#f25011]/50 text-[#f25011]" : ""
          }`}
        >
          <SlidersHorizontal size={16} />
          {hasActiveFilters && (
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#f25011]" />
          )}
        </Button>
      </form>

      {showFilters && (
        <div className="mb-6 p-4 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-zinc-50 dark:bg-zinc-900/50">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {!lockedSpaceId && (
              <div>
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">
                  Space
                </label>
                <select
                  value={spaceId}
                  onChange={(e) => setSpaceId(e.target.value)}
                  className="w-full h-9 px-3 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                >
                  <option value="">All spaces</option>
                  {spaces.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">
                Author
              </label>
              <select
                value={authorId}
                onChange={(e) => setAuthorId(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
              >
                <option value="">All authors</option>
                {orgAuthors.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.email}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">
                Tag / label
              </label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="e.g. policies, onboarding"
                className="w-full h-9 px-3 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">
                File type
              </label>
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
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">
                From date
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">
                To date
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
              />
            </div>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-3 text-xs text-[#f25011] hover:underline flex items-center gap-1"
            >
              <X size={12} /> Clear filters
            </button>
          )}
        </div>
      )}

      {loading && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="w-full h-20 rounded-xl" />
          ))}
        </div>
      )}

      {!loading && searched && results && (
        <div>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-4 font-medium">
            {resultsLabel}
          </p>

          {results.hits.length === 0 ? (
            <Card>
              <CardContent className="py-14 flex flex-col items-center gap-3 text-zinc-400 dark:text-zinc-500">
                <Search size={32} className="opacity-30" />
                <p className="text-sm">
                  {hasTextQuery
                    ? `No results found for “${query}”`
                    : "No documents match these filters"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-2">
              {results.hits.map((hit) => (
                <button
                  key={hit.documentId}
                  type="button"
                  className="group text-left w-full"
                  onClick={() =>
                    router.push(`/spaces/${hit.spaceId}/docs/${hit.documentId}`)
                  }
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
                        {hit.type === "pdf" ? (
                          <File size={15} />
                        ) : (
                          <FileText size={15} />
                        )}
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
                            dangerouslySetInnerHTML={{
                              __html: hit.highlight.body[0],
                            }}
                          />
                        ) : hit.preview ? (
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
                            {hit.preview}
                          </p>
                        ) : null}
                      </div>
                      <Chip size="sm" variant="soft" className="text-xs shrink-0">
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

      {!loading && !searched && !lockedSpaceId && (
        <div className="flex flex-col items-center gap-3 py-12 text-zinc-300 dark:text-zinc-600">
          <Search size={40} strokeWidth={1} />
          <p className="text-sm text-zinc-400 dark:text-zinc-500">
            Type a query and press Enter, or apply filters
          </p>
        </div>
      )}
    </div>
  );
}
