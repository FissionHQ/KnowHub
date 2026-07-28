"use client";

import { useState, useCallback, useEffect, useRef, useMemo, useId } from "react";
import { useRouter } from "next/navigation";
import { searchApi, spacesApi, usersApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { SearchResponse, Space, User } from "@wiki/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Search, FileText, File, X, SlidersHorizontal } from "lucide-react";
import useSWR from "swr";

export interface SearchPanelProps {
  /** When set, search is scoped to this space and the space filter is hidden. */
  lockedSpaceId?: string;
  placeholder?: string;
  onSearchedChange?: (searched: boolean) => void;
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const selected = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative" id={id}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-card text-foreground flex items-center justify-between gap-2 cursor-pointer transition-colors"
      >
        <span className="truncate">{selected?.label}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onMouseDown={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                opt.value === value
                  ? "bg-primary text-white"
                  : "text-foreground/80 hover:bg-primary hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
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
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder={placeholder}
            className="w-full h-11 pl-9 pr-4 text-sm border border-border rounded-xl bg-card text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary transition-colors"
          />
          {showSuggestions && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden">
              {suggestions.map((s, i) => (
                <button
                  key={`${s}-${i}`}
                  type="button"
                  className="w-full text-left px-4 py-2.5 text-sm text-foreground/80 hover:bg-background dark:hover:bg-accent transition-colors"
                  onMouseDown={() => selectSuggestion(s)}
                >
                  <Search size={12} className="inline mr-2 text-muted-foreground" />
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowFilters(!showFilters)}
          className={`h-11 px-3 border-border relative ${
            hasActiveFilters ? "border-primary/50 text-primary" : ""
          }`}
        >
          <SlidersHorizontal size={16} />
          {hasActiveFilters && (
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary" />
          )}
        </Button>
      </form>

      {showFilters && (
        <div className="mb-6 p-4 border border-border rounded-xl bg-muted/50">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {!lockedSpaceId && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Space
                </label>
                <FilterSelect
                  value={spaceId}
                  onChange={setSpaceId}
                  options={[{ value: "", label: "All spaces" }, ...spaces.map((s) => ({ value: s.id, label: s.name }))]}
                />
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Author
              </label>
              <FilterSelect
                value={authorId}
                onChange={setAuthorId}
                options={[{ value: "", label: "All authors" }, ...orgAuthors.map((u) => ({ value: u.id, label: u.name || u.email }))]}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Tag / label
              </label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="e.g. policies, onboarding"
                className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-card text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                File type
              </label>
              <FilterSelect
                value={type}
                onChange={setType}
                options={[
                  { value: "", label: "All types" },
                  { value: "page", label: "Page" },
                  { value: "pdf", label: "PDF" },
                ]}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                From date
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-card text-foreground"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                To date
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-card text-foreground"
              />
            </div>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-3 text-xs text-primary hover:underline flex items-center gap-1"
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
          <p className="text-xs text-muted-foreground mb-4 font-medium">
            {resultsLabel}
          </p>

          {results.hits.length === 0 ? (
            <Card>
              <CardContent className="py-14 flex flex-col items-center gap-3 text-muted-foreground">
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
                  <Card className="transition-all hover:shadow-sm hover:border-primary/30 cursor-pointer">
                    <CardContent className="flex flex-row items-start gap-3 p-4">
                      <div
                        className={
                          hit.type === "pdf"
                            ? "p-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-500 shrink-0 mt-0.5"
                            : "p-2 rounded-lg bg-orange-50 dark:bg-orange-950/40 text-primary shrink-0 mt-0.5"
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
                          className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors [&_mark]:bg-yellow-200 [&_mark]:dark:bg-yellow-800/50 [&_mark]:px-0.5 [&_mark]:rounded [&_mark]:text-inherit"
                          dangerouslySetInnerHTML={{
                            __html: hit.highlight.title?.[0] ?? hit.title,
                          }}
                        />
                        {hit.highlight.body?.[0] ? (
                          <p
                            className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed [&_mark]:bg-yellow-200 [&_mark]:dark:bg-yellow-800/50 [&_mark]:px-0.5 [&_mark]:rounded"
                            dangerouslySetInnerHTML={{
                              __html: hit.highlight.body[0],
                            }}
                          />
                        ) : hit.preview ? (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                            {hit.preview}
                          </p>
                        ) : null}
                      </div>
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {hit.type.toUpperCase()}
                      </Badge>
                    </CardContent>
                  </Card>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
