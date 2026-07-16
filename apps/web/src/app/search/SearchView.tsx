"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { searchApi } from "@/lib/api";
import type { SearchResponse } from "@wiki/types";
import { Chip, Card, CardContent } from "@heroui/react";
import { Search, FileText, File } from "lucide-react";
import { motion, AnimatePresence, type Variants } from "framer-motion";

const DEBOUNCE_MS = 350;

function ResultSkeleton() {
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 animate-pulse">
      <div className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-800 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="h-3.5 w-2/5 rounded bg-zinc-100 dark:bg-zinc-800" />
        <div className="h-2.5 w-4/5 rounded bg-zinc-100 dark:bg-zinc-800" />
        <div className="h-2.5 w-3/5 rounded bg-zinc-100 dark:bg-zinc-800" />
      </div>
      <div className="w-9 h-5 rounded-full bg-zinc-100 dark:bg-zinc-800 shrink-0" />
    </div>
  );
}

const listVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

export function SearchView() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [focused, setFocused] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults(null);
      setSearched(false);
      setLoading(false);
      return;
    }
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

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-1">Search</h1>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm">Find pages and PDFs across all your spaces</p>
      </div>

      {/* Search bar */}
      <motion.div
        className="relative mb-8"
        animate={focused ? { scale: 1.01 } : { scale: 1 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
      >
        <motion.div
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400"
          animate={loading ? { rotate: [0, 15, -15, 10, -10, 0] } : { rotate: 0 }}
          transition={loading ? { duration: 0.5, repeat: Infinity, repeatDelay: 0.2 } : { duration: 0.2 }}
        >
          <Search size={16} />
        </motion.div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Search pages and PDFs…"
          className="w-full h-11 pl-9 pr-4 text-sm border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-colors"
        />
        <AnimatePresence>
          {loading && (
            <motion.div
              className="absolute right-3 top-1/2 -translate-y-1/2"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ duration: 0.15 }}
            >
              <div className="w-4 h-4 rounded-full border-2 border-violet-400 border-t-transparent animate-spin" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Skeleton loading */}
      <AnimatePresence>
        {loading && (
          <motion.div
            key="skeletons"
            className="flex flex-col gap-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {Array.from({ length: 4 }).map((_, i) => (
              <ResultSkeleton key={i} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results */}
      <AnimatePresence mode="wait">
        {!loading && results && (
          <motion.div
            key="results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-4 font-medium">
              {results.total} result{results.total !== 1 ? "s" : ""} for &ldquo;{query}&rdquo;
            </p>

            {results.hits.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                <Card>
                  <CardContent className="py-14 flex flex-col items-center gap-3 text-zinc-400 dark:text-zinc-500 p-5">
                    <Search size={32} className="opacity-30" />
                    <p className="text-sm">No results found for &ldquo;{query}&rdquo;</p>
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              <motion.div
                className="flex flex-col gap-2"
                variants={listVariants}
                initial="hidden"
                animate="visible"
              >
                {results.hits.map((hit) => (
                  <motion.button
                    key={hit.documentId}
                    type="button"
                    className="group text-left w-full"
                    onClick={() => router.push(`/spaces/${hit.spaceId}/docs/${hit.documentId}`)}
                    variants={itemVariants}
                    whileHover={{ scale: 1.005 }}
                    whileTap={{ scale: 0.998 }}
                  >
                    <Card className="transition-all hover:shadow-sm hover:border-violet-200 dark:hover:border-violet-800 cursor-pointer">
                      <CardContent className="flex flex-row items-start gap-3 p-4">
                        <div
                          className={
                            hit.type === "pdf"
                              ? "p-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-500 shrink-0 mt-0.5"
                              : "p-2 rounded-lg bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 shrink-0 mt-0.5"
                          }
                        >
                          {hit.type === "pdf" ? <File size={15} /> : <FileText size={15} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm group-hover:text-violet-700 dark:group-hover:text-violet-300 transition-colors"
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
                  </motion.button>
                ))}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state before first search */}
      <AnimatePresence>
        {!loading && !searched && (
          <motion.div
            key="empty"
            className="flex flex-col items-center gap-3 py-20 text-zinc-300 dark:text-zinc-600"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            <Search size={48} strokeWidth={1} />
            <p className="text-sm text-zinc-400 dark:text-zinc-500">Type something to search</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
